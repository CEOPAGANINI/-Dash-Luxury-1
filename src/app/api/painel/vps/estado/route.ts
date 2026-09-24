import type { NextRequest } from "next/server";

import { exigirDonoDaVps, preRequisitosVps } from "@/features/vps/acesso";
import { chaveMestra } from "@/features/vps/chaves";
import { R_UUID, VpsError } from "@/features/vps/modelo";
import { montarEstado } from "@/features/vps/queries";
import { respostaDeErroVps } from "@/features/vps/servico";

/*
  GET /api/painel/vps/estado?servidor=<uuid>&site=<uuid> — o polling das
  telas do Servidor (5 s com tarefa aberta ou agente aguardando, 15 s no
  resto). Não conta no limite de 10 ações por minuto: só lê (e roda as
  transições preguiçosas, que não dependem de quem pergunta).

  Grava viewer_seen_at dos servidores exibidos (freio de 30 s): com a tela
  aberta o agente pulsa a cada 5 s e a tarefa sai rápido.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { session, db, workspaceId } = await exigirDonoDaVps({
      alterar: false,
    });
    const servidorId = request.nextUrl.searchParams.get("servidor");
    const siteId = request.nextUrl.searchParams.get("site");
    if (
      (servidorId !== null && !R_UUID.test(servidorId)) ||
      (siteId !== null && !R_UUID.test(siteId))
    )
      throw new VpsError(400, "dados_invalidos", "Identificador inválido.");

    const [pendencias, estado] = await Promise.all([
      preRequisitosVps(session),
      montarEstado(db, workspaceId, { servidorId, siteId, marcarVisto: true }),
    ]);
    return Response.json(
      {
        ok: true,
        ...estado,
        podeAlterar: Boolean(chaveMestra()),
        pendencias,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    // Modo demo leva 401, como /api/live-view: a tela diz "entre de novo".
    if (erro instanceof VpsError && erro.codigo === "modo_demo")
      return respostaDeErroVps(new VpsError(401, "modo_demo", erro.message));
    return respostaDeErroVps(erro);
  }
}
