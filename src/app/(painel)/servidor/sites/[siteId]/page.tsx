import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { R_UUID } from "@/features/vps/modelo";
import { PainelIndisponivel } from "@/features/vps/pre-requisitos";
import { lerPainelVps } from "@/features/vps/queries";
import { SiteDetalhe } from "@/features/vps/site-detalhe";
import { estadoDaTela } from "@/features/vps/vps-cliente";

export const metadata: Metadata = { title: "Servidor" };
export const dynamic = "force-dynamic";
// O maxDuration das server actions vem da página que as chama.
export const maxDuration = 30;

/**
 * Um site. Id que não é UUID nem chega ao banco; id de outro workspace (ou
 * removido) volta como `site: null` da leitura e também dá 404.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  if (!R_UUID.test(siteId)) notFound();

  const painel = await lerPainelVps({ siteId });
  if (painel.estado === "ok" && !painel.dados.site) notFound();

  const site = painel.estado === "ok" ? painel.dados.site : null;
  const principal = site
    ? (site.dominios.find((d) => d.principal) ?? site.dominios[0])?.hostname
    : null;
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={site?.nome ?? "Site"}
        description={
          site
            ? `${principal ?? "sem domínio"} · no servidor ${site.servidorNome || "—"}`
            : "Domínio, HTTPS, versões e conferência de um site do funil."
        }
      />
      {painel.estado === "ok" ? (
        <SiteDetalhe
          key={siteId}
          inicial={estadoDaTela(painel)}
          siteId={siteId}
        />
      ) : (
        <PainelIndisponivel painel={painel} />
      )}
    </div>
  );
}
