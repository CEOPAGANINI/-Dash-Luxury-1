import type { NextRequest } from "next/server";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { R_UUID } from "@/features/vps/modelo";
import {
  lerCorpo,
  LIMITE_CORPO,
  respostaErroAgente,
  verificarPedido,
} from "@/features/vps/protocolo";
import {
  lerArtefatoParaAgente,
  respostaDeErroVps,
} from "@/features/vps/servico";

/*
  GET /api/agente/v1/artefatos/[artefatoId] — o ZIP de uma publicação
  (§5.D). Assinado com corpo vazio. Só sai para o servidor dono do site e
  só enquanto o `site.publicar` daquela versão está ENTREGUE; depois a
  linha do artefato some e a resposta é 404 (não existe 410).

  A integridade de verdade vem do sha256 que está DENTRO da tarefa
  assinada: o agente confere os bytes antes de extrair. O X-Dash-Sha256
  daqui é só diagnóstico.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artefatoId: string }> },
) {
  const { artefatoId } = await params;
  const lido = await lerCorpo(request, LIMITE_CORPO.artefato);
  if (!lido.ok) return lido.resposta;
  if (!isDatabaseConfigured())
    return respostaErroAgente(503, "database_not_configured");

  try {
    const db = getDb();
    const verificado = await verificarPedido(db, request, lido.corpo, {
      limite: LIMITE_CORPO.artefato,
    });
    if (!verificado.ok) return verificado.resposta;
    if (!R_UUID.test(artefatoId)) return respostaErroAgente(404, "not_found");

    const artefato = await lerArtefatoParaAgente(
      db,
      verificado.servidor.id,
      artefatoId,
    );
    if (!artefato) return respostaErroAgente(404, "not_found");
    return new Response(new Uint8Array(artefato.conteudo), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(artefato.conteudo.length),
        "X-Dash-Sha256": artefato.sha256,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    return respostaDeErroVps(erro, "agente");
  }
}
