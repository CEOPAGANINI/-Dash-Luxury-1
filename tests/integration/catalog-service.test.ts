// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  categories,
  inventoryMovements,
  productCategories,
  products,
  productVariants,
  stores,
} from "@/database/schema";
import {
  adjustCatalogStock,
  archiveCatalogEntity,
  saveCatalogCategory,
  saveCatalogProduct,
} from "@/features/catalog/service";
import {
  catalogSlug,
  categoryInputSchema,
  inventoryInputSchema,
  moneyToCents,
  productInputSchema,
} from "@/features/catalog/validation";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

let banco: BancoDeTeste;
beforeAll(async () => {
  banco = await criarBancoDeTeste();
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});
const input = (slug: string, extra = {}) =>
  productInputSchema.parse({
    name: "Produto real",
    slug,
    type: "physical",
    status: "active",
    priceCents: 12990,
    ...extra,
  });
const product = async (id: string) =>
  (await banco.db.select().from(products).where(eq(products.id, id)))[0];

describe("catálogo real e alterações transacionais", () => {
  it("converte dinheiro sem arredondar centavos e valida moedas, promoções e movimentos", () => {
    expect(moneyToCents("129,90")).toBe(12990);
    expect(moneyToCents("1.234,56")).toBe(123456);
    expect(moneyToCents("129.90")).toBe(12990);
    expect(moneyToCents("0,01")).toBe(1);
    expect(() => moneyToCents("1,999")).toThrow();
    expect(() => moneyToCents("-1")).toThrow();
    expect(() => input("invalid", { currency: "USD" })).toThrow();
    expect(() => input("invalid", { promoPriceCents: 20000 })).toThrow();
    expect(catalogSlug("Relógio — Edição 2026")).toBe("relogio-edicao-2026");
    expect(
      inventoryInputSchema.safeParse({
        productId: crypto.randomUUID(),
        version: new Date().toISOString(),
        quantity: -1,
        reason: "return",
        note: "Teste",
      }).success,
    ).toBe(false);
  });

  it("grava produto EUR com categorias sem modificar a outra operação", async () => {
    const own = await criarWorkspaceDeTeste(banco.db);
    const foreign = await criarWorkspaceDeTeste(banco.db);
    const categoryId = await saveCatalogCategory(
      banco.db,
      own.workspaceId,
      categoryInputSchema.parse({ name: "Coleção", slug: "colecao" }),
    );
    const foreignCategoryId = await saveCatalogCategory(
      banco.db,
      foreign.workspaceId,
      categoryInputSchema.parse({ name: "Outra", slug: "outra" }),
    );
    const id = await saveCatalogProduct(
      banco.db,
      own.workspaceId,
      input("relogio", { currency: "EUR", categoryIds: [categoryId] }),
    );
    expect(await product(id)).toMatchObject({
      currency: "EUR",
      priceCents: 12990,
      stockQuantity: 0,
    });
    expect(
      await banco.db
        .select()
        .from(productCategories)
        .where(eq(productCategories.productId, id)),
    ).toHaveLength(1);
    await expect(
      saveCatalogProduct(
        banco.db,
        own.workspaceId,
        input("rollback", { categoryIds: [foreignCategoryId] }),
      ),
    ).rejects.toThrow("não pertence");
    expect(
      await banco.db
        .select()
        .from(products)
        .where(
          and(
            eq(products.workspaceId, own.workspaceId),
            eq(products.slug, "rollback"),
          ),
        ),
    ).toHaveLength(0);
    await expect(
      saveCatalogProduct(
        banco.db,
        foreign.workspaceId,
        input("foreign-update"),
        { id, version: (await product(id)).updatedAt.toISOString() },
      ),
    ).rejects.toThrow("não encontrado");
    expect((await product(id)).slug).toBe("relogio");
  });

  it("rejeita lojas externas e edições obsoletas sem perder o cadastro vigente", async () => {
    const own = await criarWorkspaceDeTeste(banco.db);
    const foreign = await criarWorkspaceDeTeste(banco.db);
    const [store] = await banco.db
      .insert(stores)
      .values({
        workspaceId: foreign.workspaceId,
        name: "Outra loja",
        slug: `externa-${crypto.randomUUID()}`,
      })
      .returning();
    await expect(
      saveCatalogProduct(
        banco.db,
        own.workspaceId,
        input("foreign-store", { storeId: store.id }),
      ),
    ).rejects.toThrow("loja selecionada");
    const id = await saveCatalogProduct(
      banco.db,
      own.workspaceId,
      input("antes"),
    );
    const version = (await product(id)).updatedAt.toISOString();
    await saveCatalogProduct(
      banco.db,
      own.workspaceId,
      input("depois", { priceCents: 15000 }),
      { id, version },
    );
    await expect(
      saveCatalogProduct(banco.db, own.workspaceId, input("perdido"), {
        id,
        version,
      }),
    ).rejects.toThrow("outra tela");
    expect(await product(id)).toMatchObject({
      slug: "depois",
      priceCents: 15000,
    });
  });

  it("registra estoque com histórico, impede duplicação e saldo negativo e preserva ao arquivar", async () => {
    const own = await criarWorkspaceDeTeste(banco.db);
    const id = await saveCatalogProduct(
      banco.db,
      own.workspaceId,
      input("estoque", { trackInventory: true }),
    );
    const movement = {
      productId: id,
      variantId: null,
      version: (await product(id)).updatedAt.toISOString(),
      quantity: 10,
      reason: "restock" as const,
      note: "Recebido do fornecedor",
    };
    expect(
      await adjustCatalogStock(
        banco.db,
        own.workspaceId,
        movement,
        own.perfilId,
      ),
    ).toBe(10);
    await expect(
      adjustCatalogStock(banco.db, own.workspaceId, movement, own.perfilId),
    ).rejects.toThrow("outra tela");
    await expect(
      adjustCatalogStock(
        banco.db,
        own.workspaceId,
        {
          ...movement,
          version: (await product(id)).updatedAt.toISOString(),
          quantity: -11,
          reason: "adjustment",
        },
        own.perfilId,
      ),
    ).rejects.toThrow("negativo");
    const history = await banco.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, id));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      workspaceId: own.workspaceId,
      quantity: 10,
      reason: "restock",
    });
    expect(history[0].note).toContain(own.perfilId);
    expect((await product(id)).stockQuantity).toBe(10);
    await archiveCatalogEntity(
      banco.db,
      own.workspaceId,
      "product",
      id,
      (await product(id)).updatedAt.toISOString(),
    );
    expect(await product(id)).toMatchObject({
      status: "archived",
      stockQuantity: 10,
    });
    expect((await product(id)).deletedAt).not.toBeNull();
    expect(
      await banco.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.productId, id)),
    ).toHaveLength(1);
    await expect(
      adjustCatalogStock(
        banco.db,
        own.workspaceId,
        { ...movement, version: (await product(id)).updatedAt.toISOString() },
        own.perfilId,
      ),
    ).rejects.toThrow("não encontrado");
  });

  it("movimenta a variação certa, isolada do saldo base e de variações externas", async () => {
    const own = await criarWorkspaceDeTeste(banco.db);
    const other = await criarWorkspaceDeTeste(banco.db);
    const id = await saveCatalogProduct(
      banco.db,
      own.workspaceId,
      input("variacoes", { trackInventory: true }),
    );
    const foreignId = await saveCatalogProduct(
      banco.db,
      other.workspaceId,
      input("variacoes", { trackInventory: true }),
    );
    const [variant] = await banco.db
      .insert(productVariants)
      .values({
        workspaceId: own.workspaceId,
        productId: id,
        name: "Preto",
        stockQuantity: 2,
      })
      .returning();
    const [foreign] = await banco.db
      .insert(productVariants)
      .values({
        workspaceId: other.workspaceId,
        productId: foreignId,
        name: "Outro",
        stockQuantity: 5,
      })
      .returning();
    const movement = {
      productId: id,
      variantId: variant.id,
      version: variant.updatedAt.toISOString(),
      quantity: -1,
      reason: "adjustment" as const,
      note: "Correção após contagem",
    };
    expect(
      await adjustCatalogStock(
        banco.db,
        own.workspaceId,
        movement,
        own.perfilId,
      ),
    ).toBe(1);
    expect((await product(id)).stockQuantity).toBe(0);
    await expect(
      adjustCatalogStock(
        banco.db,
        own.workspaceId,
        {
          ...movement,
          variantId: foreign.id,
          version: foreign.updatedAt.toISOString(),
        },
        own.perfilId,
      ),
    ).rejects.toThrow("não encontrado");
    expect(
      (
        await banco.db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, foreign.id))
      )[0].stockQuantity,
    ).toBe(5);
    expect(
      await banco.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.productId, id)),
    ).toHaveLength(1);
  });

  it("arquiva categoria sem apagar as ligações do histórico", async () => {
    const own = await criarWorkspaceDeTeste(banco.db);
    const id = await saveCatalogCategory(
      banco.db,
      own.workspaceId,
      categoryInputSchema.parse({ name: "Histórica", slug: "historica" }),
    );
    const [category] = await banco.db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    const productId = await saveCatalogProduct(
      banco.db,
      own.workspaceId,
      input("categoria", { categoryIds: [id] }),
    );
    await archiveCatalogEntity(
      banco.db,
      own.workspaceId,
      "category",
      id,
      category.updatedAt.toISOString(),
    );
    expect(
      await banco.db
        .select()
        .from(productCategories)
        .where(eq(productCategories.productId, productId)),
    ).toHaveLength(1);
    await expect(
      saveCatalogProduct(
        banco.db,
        own.workspaceId,
        input("removida", { categoryIds: [id] }),
      ),
    ).rejects.toThrow("categoria foi removida");
  });
});
