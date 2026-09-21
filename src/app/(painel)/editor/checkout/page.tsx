import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { CheckoutEditor } from "@/features/checkout-editor/checkout-editor";

export const metadata: Metadata = { title: "Editor · Checkout" };

/**
 * Editor de checkout: à esquerda os controles (formato, campos, formas de
 * pagamento, textos, cores, selos, contagem, order bump e depoimentos) e à
 * direita a página como ela vai ficar, em computador, tablet ou celular.
 */
export default function EditorCheckoutPage() {
  return (
    <div className="dash-skin space-y-4">
      <PageHeader
        title="Editor de checkout"
        description="Monte o checkout à esquerda e veja a página mudar à direita, na hora. Os campos arrastam-se para mudar de ordem, e o que ficar aqui é o que a página do checkout mostra."
      />
      <CheckoutEditor />
    </div>
  );
}
