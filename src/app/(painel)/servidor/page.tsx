import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { PainelIndisponivel } from "@/features/vps/pre-requisitos";
import { lerPainelVps } from "@/features/vps/queries";
import { ServidoresPainel } from "@/features/vps/servidores-painel";
import { estadoDaTela } from "@/features/vps/vps-cliente";

export const metadata: Metadata = { title: "Servidor" };
export const dynamic = "force-dynamic";
// O maxDuration das server actions vem da página que as chama.
export const maxDuration = 30;

/**
 * Servidores: as VPS do funil. A leitura roda no servidor (demo, permissão,
 * configuração e erro viram frases, nunca lista vazia) e o resultado vai
 * pronto para a ilha, que depois se atualiza sozinha.
 */
export default async function Page() {
  const painel = await lerPainelVps();
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Servidores"
        description="As VPS onde ficam as páginas do seu funil. O painel não abre conexão com elas: o agente instalado em cada uma busca as tarefas assinadas."
      />
      {painel.estado === "ok" ? (
        <ServidoresPainel inicial={estadoDaTela(painel)} />
      ) : (
        <PainelIndisponivel painel={painel} />
      )}
    </div>
  );
}
