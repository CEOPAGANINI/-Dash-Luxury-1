import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { PainelIndisponivel } from "@/features/vps/pre-requisitos";
import { lerPainelVps } from "@/features/vps/queries";
import { ServidoresPainel } from "@/features/vps/servidores-painel";
import { estadoDaTela } from "@/features/vps/vps-cliente";
import {
  ServidorPreparacao,
  ServidorRecursos,
} from "@/features/vps/servidor-boas-vindas";
import styles from "@/features/vps/servidor-nexus.module.css";

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
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Servidores"
        description="Conecte sua VPS, acompanhe os recursos e publique seus sites em um só lugar."
      />
      {painel.estado === "ok" ? (
        <ServidoresPainel inicial={estadoDaTela(painel)} />
      ) : (
        <>
          <div className={styles.unavailable}>
            <PainelIndisponivel painel={painel} />
          </div>
          <div className={styles.lowerGrid}>
            <ServidorPreparacao />
            <ServidorRecursos />
          </div>
        </>
      )}
    </div>
  );
}
