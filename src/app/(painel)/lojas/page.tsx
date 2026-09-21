import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { StoresPanel } from "@/features/stores/stores-panel";
import { panoramaDasLojas } from "@/features/stores/queries";

export const metadata: Metadata = { title: "Lojas" };
export const dynamic = "force-dynamic";

/**
 * Lojas conectadas: cada loja ligada ao painel e, dentro dela, as ofertas
 * ativas que estão a receber tráfego — com o sinal que acendeu (campanha,
 * visitas ou vendas), o investido, o retorno e as campanhas que apontam
 * para cada oferta.
 */
export default async function Page() {
  const panorama = await panoramaDasLojas(30);
  return (
    <div className="dash-skin space-y-4">
      <PageHeader
        title="Lojas conectadas"
        description="As lojas ligadas ao painel e as ofertas ativas que estão recebendo tráfego — com o sinal que acendeu, o investido e o retorno de cada uma."
      />
      <StoresPanel panorama={panorama} />
    </div>
  );
}
