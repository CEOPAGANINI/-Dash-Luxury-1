"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { checkouts, products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { createCheckoutSchema, slugify } from "@/validations/checkout-crud";

export interface CheckoutActionResult {
  ok: boolean;
  error?: string;
  message?: string;
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
    const workspaceId = await getOrCreateDefaultWorkspace();
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
      .select({ id: products.id, currency: products.currency })
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

    await db.insert(checkouts).values({
      workspaceId,
      name: d.name,
      slug: d.slug,
      mainProductId: product.id,
      currency: product.currency,
      country: "PT",
      locale: "pt-PT",
      paymentMethods: d.paymentMethods,
      status: d.publishNow ? "published" : "draft",
      publishedAt: d.publishNow ? new Date() : null,
    });

    revalidatePath("/checkouts");
    return {
      ok: true,
      message: d.publishNow
        ? `Checkout publicado em /checkout/${d.slug}`
        : "Checkout criado como rascunho.",
    };
  } catch (error) {
    console.error("[checkouts] erro ao criar:", error);
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
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(checkouts)
    .set({
      status: publish ? "published" : "unpublished",
      publishedAt: publish ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(checkouts.id, id), eq(checkouts.workspaceId, workspaceId)));

  revalidatePath("/checkouts");
}

export async function duplicateCheckoutAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

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
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(checkouts)
    .set({ deletedAt: new Date(), status: "archived" })
    .where(and(eq(checkouts.id, id), eq(checkouts.workspaceId, workspaceId)));

  revalidatePath("/checkouts");
}
