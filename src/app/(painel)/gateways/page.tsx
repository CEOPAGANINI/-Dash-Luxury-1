import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { GatewaysPanel } from "@/features/gateways/gateways-panel";
import { panoramaDosGateways } from "@/features/gateways/queries";

export const metadata: Metadata = { title: "Gateways" };
export const dynamic = "force-dynamic";

/**
 * Gateways de pagamento: quem está conectado, quanto o gateway cobrou de
 * verdade nos últimos 30 dias e qual taxa o painel usa no cálculo do
 * lucro — sem ninguém digitar porcentagem.
 */
export default async function Page() {
  const panorama = await panoramaDosGateways(30);
  return (
    <div className="dash-skin space-y-4">
      <PageHeader
        title="Gateways de pagamento"
        description="A taxa do gateway entra sozinha: medida no extrato dos pagamentos aprovados ou, enquanto não há extrato, na tabela pública do gateway que você escolher."
      />
      <GatewaysPanel panorama={panorama} />
    </div>
  );
}
