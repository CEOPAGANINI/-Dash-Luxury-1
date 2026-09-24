import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { NovoServidor } from "@/features/vps/novo-servidor";
import {
  PainelIndisponivel,
  PreRequisitos,
} from "@/features/vps/pre-requisitos";
import { lerPainelVps } from "@/features/vps/queries";
import { estadoDaTela } from "@/features/vps/vps-cliente";

export const metadata: Metadata = { title: "Servidor" };
export const dynamic = "force-dynamic";
// O maxDuration das server actions vem da página que as chama.
export const maxDuration = 30;

/**
 * Adicionar servidor: nome, comando para colar no console da VPS e a
 * confirmação "é o meu servidor". O código de instalação só existe na
 * resposta da action, dentro da ilha; esta página não o vê.
 */
export default async function Page() {
  const painel = await lerPainelVps();
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Adicionar servidor"
        description="Um comando colado no console da VPS instala o agente. Depois você confirma que é o seu servidor."
      />
      {painel.estado === "ok" ? (
        <>
          {painel.pendencias.some((p) => !p.ok) && (
            <PreRequisitos pendencias={painel.pendencias} />
          )}
          <NovoServidor inicial={estadoDaTela(painel)} />
        </>
      ) : (
        <PainelIndisponivel painel={painel} />
      )}
    </div>
  );
}
