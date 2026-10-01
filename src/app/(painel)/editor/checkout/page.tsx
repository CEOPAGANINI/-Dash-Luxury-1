import type { Metadata } from "next";
import Link from "next/link";
import { isDatabaseConfigured } from "@/database/client";
import {
  listCheckouts,
  getCheckoutForEditor,
} from "@/features/checkouts/queries";
import { listProductOptions } from "@/features/reviews/queries";
import { CheckoutCreateForm } from "@/features/checkouts/checkout-create-form";
import { CheckoutWorkspaceEditor } from "@/features/checkout-editor/checkout-workspace-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { getAppUrl } from "@/lib/app-url";

export const metadata: Metadata = { title: "Editor · Checkout" };

export default async function EditorCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  if (!isDatabaseConfigured())
    return (
      <div className="dash-skin space-y-4">
        <PageHeader
          title="Editor de checkout"
          description="O editor precisa do banco para salvar seus checkouts."
        />
        <Link href="/integracoes">Abrir conexões</Link>
      </div>
    );
  const [params, rows, productOptions] = await Promise.all([
    searchParams,
    listCheckouts(),
    listProductOptions(),
  ]);
  const selectedId = params.id ?? rows[0]?.id;
  const checkout =
    selectedId && /^[0-9a-f-]{36}$/i.test(selectedId)
      ? await getCheckoutForEditor(selectedId)
      : null;
  return (
    <div className="dash-skin space-y-5">
      <PageHeader
        title="Editor de checkout"
        description="Selecione o checkout da sua conta, edite e salve. A configuração e as versões ficam no banco."
      />
      <nav aria-label="Selecionar checkout" className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/editor/checkout?id=${row.id}`}
            aria-current={checkout?.id === row.id ? "page" : undefined}
            className="border px-3 py-2 text-sm"
          >
            {row.name} · {row.status === "published" ? "Publicado" : "Rascunho"}
          </Link>
        ))}
        <Link href="/checkouts" className="border px-3 py-2 text-sm">
          Gerenciar publicação
        </Link>
      </nav>
      {checkout ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
            <span>
              {checkout.name} ·{" "}
              {checkout.productName ?? "Produto não associado"}
            </span>
            {checkout.status === "published" ? (
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href={`/checkout/${checkout.slug}?loja=${checkout.workspaceId}`}
              >
                Abrir checkout publicado ↗
              </Link>
            ) : (
              <span>Rascunho · publique em Checkouts</span>
            )}
          </div>
          <CheckoutWorkspaceEditor
            key={checkout.id}
            id={checkout.id}
            name={checkout.productName ?? checkout.name}
            config={checkout.config}
            revision={checkout.revision}
          />
        </>
      ) : (
        <div className="border p-5">
          <p>
            {selectedId
              ? "Este checkout não existe na sua conta. Selecione outro ou crie um abaixo."
              : "Crie seu primeiro checkout para editar a página de venda."}
          </p>
        </div>
      )}
      <section aria-label="Criar outro checkout" className="pt-4">
        <CheckoutCreateForm products={productOptions} appUrl={getAppUrl()} />
      </section>
    </div>
  );
}
