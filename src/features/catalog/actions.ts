"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { exigirWorkspaceRole, WorkspaceAccessError } from "@/lib/workspace";

import {
  adjustCatalogStock,
  archiveCatalogEntity,
  CatalogError,
  saveCatalogCategory,
  saveCatalogProduct,
} from "./service";
import {
  catalogSlug,
  categoryInputSchema,
  inventoryInputSchema,
  moneyToCents,
  productInputSchema,
} from "./validation";

export interface CatalogResult {
  ok: boolean;
  message: string;
  id?: string;
}
const existingSchema = z.object({
  id: z.string().uuid(),
  version: z.string().datetime(),
});
const value = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const optional = (fd: FormData, name: string) => value(fd, name) || null;
function amount(fd: FormData, name: string, required = false) {
  const input = value(fd, name);
  if (!input && !required) return null;
  try {
    return moneyToCents(input);
  } catch {
    throw new CatalogError(
      "Informe preços válidos, com no máximo duas casas decimais, como 129,90.",
    );
  }
}
function existing(fd: FormData) {
  return value(fd, "id")
    ? existingSchema.parse({
        id: value(fd, "id"),
        version: value(fd, "version"),
      })
    : undefined;
}
function message(error: unknown): string {
  if (error instanceof CatalogError || error instanceof WorkspaceAccessError)
    return error.message;
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Revise os campos.";
  return "Não foi possível salvar. Confira a conexão e tente novamente; nenhum erro privado foi exibido.";
}
function refresh() {
  revalidatePath("/catalogo", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/checkouts");
  revalidatePath("/editor", "layout");
}

export async function saveProductAction(
  _previous: CatalogResult | null,
  fd: FormData,
): Promise<CatalogResult> {
  if (!isDatabaseConfigured())
    return { ok: false, message: "Conecte o banco para salvar produtos." };
  try {
    const { workspaceId } = await exigirWorkspaceRole(["marketing", "finance"]);
    const prior = existing(fd);
    const name = value(fd, "name");
    const input = productInputSchema.parse({
      name,
      slug: value(fd, "slug") || catalogSlug(name),
      sku: value(fd, "sku"),
      type: value(fd, "type"),
      status: value(fd, "status"),
      currency: value(fd, "currency"),
      priceCents: amount(fd, "price", true),
      promoPriceCents: amount(fd, "promoPrice"),
      costCents: amount(fd, "cost"),
      storeId: optional(fd, "storeId"),
      description: value(fd, "description"),
      shortDescription: value(fd, "shortDescription"),
      mainImageUrl: value(fd, "mainImageUrl"),
      deliveryUrl: value(fd, "deliveryUrl"),
      trackInventory: fd.get("trackInventory") === "on",
      minStockAlert:
        optional(fd, "minStockAlert") === null
          ? null
          : Number(value(fd, "minStockAlert")),
      categoryIds: fd.getAll("categoryIds"),
    });
    const id = await saveCatalogProduct(getDb(), workspaceId, input, prior);
    refresh();
    return {
      ok: true,
      id,
      message: prior
        ? "Produto atualizado."
        : "Produto criado. Ative-o antes de publicar um checkout.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function saveCategoryAction(
  _previous: CatalogResult | null,
  fd: FormData,
): Promise<CatalogResult> {
  if (!isDatabaseConfigured())
    return { ok: false, message: "Conecte o banco para salvar categorias." };
  try {
    const { workspaceId } = await exigirWorkspaceRole(["marketing", "finance"]);
    const prior = existing(fd);
    const name = value(fd, "name");
    const input = categoryInputSchema.parse({
      name,
      slug: value(fd, "slug") || catalogSlug(name),
      description: value(fd, "description"),
      storeId: optional(fd, "storeId"),
      imageUrl: value(fd, "imageUrl"),
    });
    const id = await saveCatalogCategory(getDb(), workspaceId, input, prior);
    refresh();
    return {
      ok: true,
      id,
      message: prior ? "Categoria atualizada." : "Categoria criada.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function archiveCatalogAction(
  _previous: CatalogResult | null,
  fd: FormData,
): Promise<CatalogResult> {
  if (!isDatabaseConfigured())
    return { ok: false, message: "Conecte o banco para arquivar registros." };
  try {
    const { workspaceId } = await exigirWorkspaceRole(["marketing", "finance"]);
    const target = existingSchema
      .extend({ type: z.enum(["product", "category"]) })
      .parse({
        id: value(fd, "id"),
        version: value(fd, "version"),
        type: value(fd, "type"),
      });
    await archiveCatalogEntity(
      getDb(),
      workspaceId,
      target.type,
      target.id,
      target.version,
    );
    refresh();
    return { ok: true, message: "Arquivado sem apagar o histórico." };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function adjustStockAction(
  _previous: CatalogResult | null,
  fd: FormData,
): Promise<CatalogResult> {
  if (!isDatabaseConfigured())
    return { ok: false, message: "Conecte o banco para movimentar estoque." };
  try {
    const { workspaceId, user } = await exigirWorkspaceRole([
      "marketing",
      "finance",
    ]);
    const input = inventoryInputSchema.parse({
      productId: value(fd, "productId"),
      variantId: optional(fd, "variantId"),
      version: value(fd, "version"),
      quantity: Number(value(fd, "quantity")),
      reason: value(fd, "reason"),
      note: value(fd, "note"),
    });
    const stock = await adjustCatalogStock(
      getDb(),
      workspaceId,
      input,
      user.id,
    );
    refresh();
    return {
      ok: true,
      message: `Movimento registrado. Estoque atual: ${stock}.`,
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
