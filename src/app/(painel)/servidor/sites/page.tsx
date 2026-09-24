import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { PainelIndisponivel } from "@/features/vps/pre-requisitos";
import { lerPainelVps } from "@/features/vps/queries";
import { SitesPainel } from "@/features/vps/sites-painel";
import { estadoDaTela } from "@/features/vps/vps-cliente";

export const metadata: Metadata = { title: "Servidor" };
export const dynamic = "force-dynamic";
// O maxDuration das server actions vem da página que as chama.
export const maxDuration = 30;

/** Sites: todos os sites das VPS, e o bloco para criar um novo. */
export default async function Page() {
  const painel = await lerPainelVps();
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Sites"
        description="Cada site é uma pasta numa VPS, com os seus domínios, o HTTPS e as versões enviadas em ZIP."
      />
      {painel.estado === "ok" ? (
        <SitesPainel inicial={estadoDaTela(painel)} />
      ) : (
        <PainelIndisponivel painel={painel} />
      )}
    </div>
  );
}
