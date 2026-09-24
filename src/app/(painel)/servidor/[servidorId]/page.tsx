import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { R_UUID } from "@/features/vps/modelo";
import { PainelIndisponivel } from "@/features/vps/pre-requisitos";
import { lerPainelVps } from "@/features/vps/queries";
import { ServidorDetalhe } from "@/features/vps/servidor-detalhe";
import { estadoDaTela } from "@/features/vps/vps-cliente";

export const metadata: Metadata = { title: "Servidor" };
export const dynamic = "force-dynamic";
// O maxDuration das server actions vem da página que as chama.
export const maxDuration = 30;

/**
 * Um servidor. Id que não é UUID nem chega ao banco; id de outro workspace
 * (ou removido) volta como `servidor: null` da leitura e também dá 404.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ servidorId: string }>;
}) {
  const { servidorId } = await params;
  if (!R_UUID.test(servidorId)) notFound();

  const painel = await lerPainelVps({ servidorId });
  if (painel.estado === "ok" && !painel.dados.servidor) notFound();

  const servidor = painel.estado === "ok" ? painel.dados.servidor : null;
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={servidor?.nome ?? "Servidor"}
        description={
          servidor?.registro?.hostname
            ? `${servidor.registro.hostname} · ${servidor.registro.so ?? "sistema não informado"}`
            : "Sinal, saúde, sites e tarefas de uma VPS do funil."
        }
      />
      {painel.estado === "ok" ? (
        <ServidorDetalhe
          key={servidorId}
          inicial={estadoDaTela(painel)}
          servidorId={servidorId}
        />
      ) : (
        <PainelIndisponivel painel={painel} />
      )}
    </div>
  );
}
