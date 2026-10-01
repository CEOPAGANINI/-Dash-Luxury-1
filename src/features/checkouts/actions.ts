"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { checkouts, checkoutVersions, products } from "@/database/schema";
import { exigirWorkspaceRole } from "@/lib/workspace";
import {
  checkoutConfigSchema,
  completarConfig,
} from "@/features/checkout-editor/checkout-config";
import { createCheckoutSchema, slugify } from "@/validations/checkout-crud";

export interface CheckoutActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  checkoutId?: string;
}

export async function createCheckoutAction(
  _prev: CheckoutActionResult | null,
  formData: FormData,
): Promise<CheckoutActionResult> {
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();

  const parsed = createCheckoutSchema.safeParse({
    name: rawName,
    // Se o utilizador não escrever o endereço, derivamos do nome.
    slug: rawSlug || slugify(rawName),
    productId: formData.get("productId"),
    paymentMethods: formData.getAll("paymentMethods"),
    publishNow: formData.get("publishNow") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const { workspaceId } = await exigirWorkspaceRole([
      "owner",
      "admin",
      "finance",
    ]);
    const d = parsed.data;

    // O slug é a URL pública — não pode colidir dentro do workspace.
    const existing = await db
      .select({ id: checkouts.id })
      .from(checkouts)
      .where(
        and(
          eq(checkouts.workspaceId, workspaceId),
          eq(checkouts.slug, d.slug),
          isNull(checkouts.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return {
        ok: false,
        error: `Já existe um checkout com o endereço "${d.slug}". Escolha outro.`,
      };
    }

    // O produto tem de pertencer ao workspace.
    const [product] = await db
      .select({
        id: products.id,
        currency: products.currency,
        status: products.status,
        type: products.type,
      })
      .from(products)
      .where(
        and(
          eq(products.id, d.productId),
          eq(products.workspaceId, workspaceId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);

    if (!product) {
      return { ok: false, error: "Produto não encontrado." };
    }
    if (product.type === "subscription")
      return {
        ok: false,
        error:
          "O Broski não processa assinaturas. Escolha um produto de pagamento único.",
      };
    if (d.publishNow && product.status !== "active")
      return {
        ok: false,
        error: "Ative o produto antes de publicar o checkout.",
      };
    if (product.currency !== "EUR")
      return {
        ok: false,
        error:
          "O Broski processa somente EUR. Defina a moeda do produto como EUR antes de criar o checkout.",
      };

    const [created] = await db
      .insert(checkouts)
      .values({
        workspaceId,
        name: d.name,
        slug: d.slug,
        mainProductId: product.id,
        currency: product.currency,
        country: "PT",
        locale: "pt-PT",
        paymentMethods: d.paymentMethods,
        config: completarConfig({
          pagamentos: d.paymentMethods,
          campos: [
            { id: "nome", ativo: true, obrigatorio: true },
            { id: "email", ativo: true, obrigatorio: true },
            {
              id: "telefone",
              ativo: true,
              obrigatorio: d.paymentMethods.includes("mbway"),
            },
            { id: "documento", ativo: false, obrigatorio: false },
            {
              id: "endereco",
              ativo: product.type !== "digital",
              obrigatorio: product.type !== "digital",
            },
            { id: "cupom", ativo: false, obrigatorio: false },
          ],
        }),
        status: d.publishNow ? "published" : "draft",
        publishedAt: d.publishNow ? new Date() : null,
      })
      .returning({ id: checkouts.id });

    revalidatePath("/checkouts");
    revalidatePath("/editor/checkout");
    return {
      ok: true,
      checkoutId: created.id,
      message: d.publishNow
        ? `Checkout publicado em /checkout/${d.slug}?loja=${workspaceId}`
        : "Checkout criado como rascunho.",
    };
  } catch {
    console.error("[checkouts] create_failed");
    return { ok: false, error: "Não foi possível criar o checkout." };
  }
}

/** Publica ou despublica. Só checkouts publicados abrem na URL pública. */
export async function toggleCheckoutStatusAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const publish = formData.get("publish") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const { workspaceId } = await exigirWorkspaceRole([
    "owner",
    "admin",
    "finance",
  ]);

  if (publish) {
    const [valid] = await db
      .select({ id: checkouts.id })
      .from(checkouts)
      .innerJoin(products, eq(products.id, checkouts.mainProductId))
      .where(
        and(
          eq(checkouts.id, id),
          eq(checkouts.workspaceId, workspaceId),
          isNull(checkouts.deletedAt),
          eq(products.workspaceId, workspaceId),
          eq(products.status, "active"),
          eq(products.currency, "EUR"),
          isNull(products.deletedAt),
          sql`${products.type} <> 'subscription'`,
        ),
      )
      .limit(1);
    if (!valid)
      throw new Error(
        "Ative um produto EUR de pagamento único antes de publicar o checkout.",
      );
  }

  await db
    .update(checkouts)
    .set({
      status: publish ? "published" : "unpublished",
      publishedAt: publish ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(checkouts.id, id),
        eq(checkouts.workspaceId, workspaceId),
        isNull(checkouts.deletedAt),
      ),
    );

  revalidatePath("/checkouts");
  revalidatePath("/editor/checkout");
}

export async function duplicateCheckoutAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const { workspaceId } = await exigirWorkspaceRole([
    "owner",
    "admin",
    "finance",
  ]);

  const [original] = await db
    .select()
    .from(checkouts)
    .where(and(eq(checkouts.id, id), eq(checkouts.workspaceId, workspaceId)))
    .limit(1);

  if (!original) return;

  // Procura um sufixo livre para não colidir com o slug existente.
  let copySlug = `${original.slug}-copia`;
  for (let i = 2; i < 50; i++) {
    const taken = await db
      .select({ id: checkouts.id })
      .from(checkouts)
      .where(
        and(
          eq(checkouts.workspaceId, workspaceId),
          eq(checkouts.slug, copySlug),
        ),
      )
      .limit(1);
    if (taken.length === 0) break;
    copySlug = `${original.slug}-copia-${i}`;
  }

  await db.insert(checkouts).values({
    workspaceId,
    name: `${original.name} (cópia)`,
    slug: copySlug,
    mainProductId: original.mainProductId,
    currency: original.currency,
    country: original.country,
    locale: original.locale,
    layoutType: original.layoutType,
    config: original.config,
    paymentMethods: original.paymentMethods,
    // A cópia nasce como rascunho — publicar é sempre decisão explícita.
    status: "draft",
  });

  revalidatePath("/checkouts");
}

export async function deleteCheckoutAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const { workspaceId } = await exigirWorkspaceRole([
    "owner",
    "admin",
    "finance",
  ]);

  await db
    .update(checkouts)
    .set({ deletedAt: new Date(), status: "archived" })
    .where(and(eq(checkouts.id, id), eq(checkouts.workspaceId, workspaceId)));

  revalidatePath("/checkouts");
}

export async function saveCheckoutConfigAction(input: {
  checkoutId: string;
  config: unknown;
  revision: string;
}): Promise<{ ok: boolean; message: string; revision?: string }> {
  const parsed = checkoutConfigSchema.safeParse(input.config);
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(input.checkoutId))
    return {
      ok: false,
      message: "Confira os campos do checkout antes de salvar.",
    };
  if (
    !parsed.data.pagamentos.length ||
    parsed.data.pagamentos.some((m) => !["mbway", "multibanco"].includes(m))
  )
    return {
      ok: false,
      message: "O gateway disponível é Broski: escolha MB WAY ou Multibanco.",
    };
  if (!isDatabaseConfigured())
    return { ok: false, message: "Banco de dados indisponível." };
  try {
    const { workspaceId, user } = await exigirWorkspaceRole([
      "owner",
      "admin",
      "finance",
    ]);
    const updatedAt = new Date();
    const config = completarConfig({
      ...parsed.data,
      campos: parsed.data.campos.map((field) =>
        field.id === "cupom"
          ? { ...field, ativo: false, obrigatorio: false }
          : field,
      ),
    });
    await getDb().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(checkouts)
        .where(
          and(
            eq(checkouts.id, input.checkoutId),
            eq(checkouts.workspaceId, workspaceId),
            isNull(checkouts.deletedAt),
          ),
        )
        .for("update");
      if (!current) throw new Error("checkout_not_found");
      if (current.updatedAt.toISOString() !== input.revision)
        throw new Error("revision_conflict");
      const [latest] = await tx
        .select({
          version: sql<number>`coalesce(max(${checkoutVersions.version}), 0)::int`,
        })
        .from(checkoutVersions)
        .where(eq(checkoutVersions.checkoutId, current.id));
      const version = latest.version + 1;
      await tx.insert(checkoutVersions).values({
        workspaceId,
        checkoutId: current.id,
        version,
        config,
        createdBy: user.id,
        isPublished: current.status === "published",
      });
      await tx
        .update(checkouts)
        .set({
          config,
          paymentMethods: config.pagamentos,
          layoutType: config.layout === "etapas" ? "multi_step" : "single_page",
          updatedAt,
        })
        .where(eq(checkouts.id, current.id));
    });
    revalidatePath("/editor/checkout");
    revalidatePath("/checkouts");
    revalidatePath("/checkout/[slug]", "page");
    return {
      ok: true,
      message:
        "Checkout salvo na sua conta. A página publicada já usa esta configuração.",
      revision: updatedAt.toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message === "revision_conflict"
          ? "Este checkout mudou em outra janela. Recarregue para comparar antes de salvar."
          : "Não foi possível salvar o checkout. Verifique sua permissão e tente novamente.",
    };
  }
}
