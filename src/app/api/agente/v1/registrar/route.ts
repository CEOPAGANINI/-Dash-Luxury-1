import { after, type NextRequest } from "next/server";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { chaveMestra } from "@/features/vps/chaves";
import { consumirLimiteIp, ipDoPedido } from "@/features/vps/limite-ip";
import {
  interpretarCorpo,
  lerCorpo,
  LIMITE_CORPO,
  PedidoRegistro,
  respostaErroAgente,
  respostaValidada,
  RespostaRegistro,
} from "@/features/vps/protocolo";
import {
  auditar,
  registrarAgente,
  respostaDeErroVps,
} from "@/features/vps/servico";

/*
  POST /api/agente/v1/registrar — o agente recém-instalado se apresenta
  (§5.A). Não há HMAC ainda: quem autentica é o código de uso único que o
  dono colou no console da VPS. O token do agente nasce NA VPS; aqui chega
  só o sha256 dele. A resposta leva as chaves derivadas desta geração
  (a única vez em que elas viajam).

  Antes do banco, freio em memória por IP (30 por minuto): uma rajada de
  códigos inventados não vira uma consulta por pedido.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Efeito que não pode atrasar nem derrubar a resposta ao agente. Fora de um
 * pedido do Next (o adaptador HTTP dos testes com o agente Python chama o
 * handler direto), `after()` lança; aí a tarefa roda solta. `auditar`
 * nunca rejeita.
 */
function emSegundoPlano(tarefa: () => Promise<void>): void {
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

export async function POST(request: NextRequest) {
  const ip = ipDoPedido(request.headers);
  if (!consumirLimiteIp(ip ?? "sem-ip"))
    return respostaErroAgente(
      429,
      "too_many_requests",
      { tenteEm: 60 },
      { "Retry-After": "60" },
    );

  const lido = await lerCorpo(request, LIMITE_CORPO.registrar);
  if (!lido.ok) return lido.resposta;
  const pedido = interpretarCorpo(lido.corpo, PedidoRegistro);
  if (!pedido.ok) return pedido.resposta;

  if (!chaveMestra()) return respostaErroAgente(503, "not_configured");
  if (!isDatabaseConfigured())
    return respostaErroAgente(503, "database_not_configured");

  try {
    const db = getDb();
    const feito = await registrarAgente(db, pedido.dados, ip);
    // Inexistente, vencido ou já usado: a mesma resposta para os três.
    if (!feito) return respostaErroAgente(401, "invalid_code");
    emSegundoPlano(() =>
      auditar(db, {
        workspaceId: feito.workspaceId,
        acao: "servidor.registrado",
        entidade: "vps_server",
        entidadeId: feito.servidorId,
        por: "agente",
        campos: {
          hostname: feito.hostname,
          ip,
          versao: pedido.dados.agente.versao,
          so: pedido.dados.agente.so,
        },
      }),
    );
    return respostaValidada(RespostaRegistro, feito.resposta);
  } catch (erro) {
    return respostaDeErroVps(erro, "agente");
  }
}
