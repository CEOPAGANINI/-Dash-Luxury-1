import type { NextRequest } from "next/server";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { ipDoPedido } from "@/features/vps/limite-ip";
import {
  interpretarCorpo,
  lerCorpo,
  LIMITE_CORPO,
  PedidoPulso,
  respostaErroAgente,
  respostaValidada,
  RespostaPulso,
  verificarPedido,
} from "@/features/vps/protocolo";
import { processarPulso, respostaDeErroVps } from "@/features/vps/servico";

/*
  POST /api/agente/v1/pulso — o agente dá sinal de vida a cada 30 s (5 s
  com tela aberta ou tarefa na fila) e recebe no máximo UMA tarefa
  assinada (§5.B). O HMAC é conferido sobre os bytes do corpo antes de
  qualquer JSON.parse; tudo que volta passa pelo zod estrito RespostaPulso
  (seq e expiraEm como número de verdade).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const lido = await lerCorpo(request, LIMITE_CORPO.pulso);
  if (!lido.ok) return lido.resposta;
  if (!isDatabaseConfigured())
    return respostaErroAgente(503, "database_not_configured");

  try {
    const db = getDb();
    const verificado = await verificarPedido(db, request, lido.corpo, {
      limite: LIMITE_CORPO.pulso,
    });
    if (!verificado.ok) return verificado.resposta;
    const pedido = interpretarCorpo(lido.corpo, PedidoPulso);
    if (!pedido.ok) return pedido.resposta;

    const resposta = await processarPulso(
      db,
      verificado.servidor,
      pedido.dados,
      ipDoPedido(request.headers),
    );
    return respostaValidada(RespostaPulso, resposta);
  } catch (erro) {
    return respostaDeErroVps(erro, "agente");
  }
}
