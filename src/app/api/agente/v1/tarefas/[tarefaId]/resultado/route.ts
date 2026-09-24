import { after, type NextRequest } from "next/server";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { R_UUID } from "@/features/vps/modelo";
import {
  interpretarCorpo,
  lerCorpo,
  LIMITE_CORPO,
  PedidoResultado,
  respostaErroAgente,
  respostaValidada,
  verificarPedido,
} from "@/features/vps/protocolo";
import {
  auditar,
  conferirSiteDepois,
  processarResultado,
  respostaDeErroVps,
  RespostaResultado,
} from "@/features/vps/servico";

/*
  POST /api/agente/v1/tarefas/[tarefaId]/resultado — o agente conta como
  a tarefa terminou (§5.C). O id vem no caminho, que entra no texto
  assinado: um resultado não troca de tarefa no meio do caminho.

  O agente reenvia o resultado pelo diário até receber 2xx, 404 ou 409;
  por isso "mesmo estado de novo" é 200 `repetido`, e "outro estado" é
  409. A auditoria e a conferência "No ar" rodam depois da resposta.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Efeito que não pode atrasar nem derrubar a resposta ao agente. Fora de um
 * pedido do Next (o adaptador HTTP dos testes com o agente Python chama o
 * handler direto), `after()` lança; aí a tarefa roda solta. As tarefas
 * daqui (auditar, conferirSiteDepois) nunca rejeitam.
 */
function emSegundoPlano(tarefa: () => Promise<void>): void {
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tarefaId: string }> },
) {
  const { tarefaId } = await params;
  const lido = await lerCorpo(request, LIMITE_CORPO.resultado);
  if (!lido.ok) return lido.resposta;
  if (!isDatabaseConfigured())
    return respostaErroAgente(503, "database_not_configured");

  try {
    const db = getDb();
    const verificado = await verificarPedido(db, request, lido.corpo, {
      limite: LIMITE_CORPO.resultado,
    });
    if (!verificado.ok) return verificado.resposta;
    if (!R_UUID.test(tarefaId)) return respostaErroAgente(404, "job_not_found");
    const pedido = interpretarCorpo(lido.corpo, PedidoResultado);
    if (!pedido.ok) return pedido.resposta;

    const { servidor } = verificado;
    const feito = await processarResultado(
      db,
      servidor,
      tarefaId,
      pedido.dados,
    );

    if (!feito.repetido && feito.siteId) {
      const siteId = feito.siteId;
      const auditoria =
        feito.versaoAtivada !== null
          ? {
              acao: "site.versao_ativada",
              campos: { versaoId: feito.versaoAtivada },
            }
          : feito.tipo === "site.remover" && feito.estado === "concluida"
            ? { acao: "site.removido", campos: {} }
            : null;
      if (auditoria)
        emSegundoPlano(() =>
          auditar(db, {
            workspaceId: servidor.workspaceId,
            acao: auditoria.acao,
            entidade: "vps_site",
            entidadeId: siteId,
            por: "agente",
            campos: { tarefaId, ...auditoria.campos },
          }),
        );
      const conferir =
        feito.estado === "concluida" &&
        (feito.versaoAtivada !== null || feito.tipo === "site.ssl_emitir");
      if (conferir)
        emSegundoPlano(() =>
          conferirSiteDepois(db, { workspaceId: servidor.workspaceId, siteId }),
        );
    }

    if (feito.invalido)
      return respostaErroAgente(400, "invalid_request", {
        detalhe: `resultado fora do formato: ${feito.invalido}`.slice(0, 300),
      });
    return respostaValidada(RespostaResultado, {
      ok: true,
      repetido: feito.repetido,
    });
  } catch (erro) {
    return respostaDeErroVps(erro, "agente");
  }
}
