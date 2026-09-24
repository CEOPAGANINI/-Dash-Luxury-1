/*
  Freio em memória por IP, ANTES de tocar o banco: 30 pedidos por minuto no
  registro do agente (§5.A) e 120 nas rotas com HMAC (pulso, resultado e
  artefato), que fazem um SELECT em vps_servers antes de saber se a
  assinatura confere.

  É por instância (a Vercel pode subir várias), então é freio, não muro:
  o código de instalação tem 256 bits e vale 30 min, e o que se quer aqui
  é que uma rajada não vire uma consulta ao banco por pedido. A regra de
  rate-limit do firewall da Vercel em /api/agente/* (docs/VPS.md) é o muro.
*/

export const LIMITE_REGISTRO_POR_MINUTO = 30;
/**
 * Um agente de verdade pulsa a cada 5 s no modo rápido (12/min), mais o
 * pulso de fundo, os resultados e o download do ZIP: 120 é folga de sobra
 * até para algumas VPS atrás do mesmo IP. O balde é outro (`hmac:<ip>`),
 * então o pulso nunca gasta a cota do registro.
 */
export const LIMITE_AGENTE_POR_MINUTO = 120;
const JANELA_MS = 60_000;
/** Acima disto, janelas vencidas são varridas (e, se preciso, tudo sai). */
const MAXIMO_DE_IPS = 10_000;

const janelas = new Map<string, { inicio: number; contagem: number }>();

/**
 * Conta um pedido do IP. Devolve false quando o IP passou do limite na
 * janela atual (a rota responde 429 `too_many_requests`).
 */
export function consumirLimiteIp(
  ip: string,
  opcoes: { limite?: number; janelaMs?: number; agora?: number } = {},
): boolean {
  const limite = opcoes.limite ?? LIMITE_REGISTRO_POR_MINUTO;
  const janelaMs = opcoes.janelaMs ?? JANELA_MS;
  const agora = opcoes.agora ?? Date.now();

  if (janelas.size > MAXIMO_DE_IPS) {
    for (const [chave, janela] of janelas)
      if (agora - janela.inicio >= janelaMs) janelas.delete(chave);
    if (janelas.size > MAXIMO_DE_IPS) janelas.clear();
  }

  const atual = janelas.get(ip);
  if (!atual || agora - atual.inicio >= janelaMs) {
    janelas.set(ip, { inicio: agora, contagem: 1 });
    return true;
  }
  atual.contagem += 1;
  return atual.contagem <= limite;
}

/** Só para testes: começa de novo sem nenhuma janela. */
export function zerarLimiteIp(): void {
  janelas.clear();
}

/**
 * O IP de quem pediu, como a Vercel informa (primeiro item de
 * x-forwarded-for, ou x-real-ip). Só aceita forma de IP; o resto vira null.
 */
export function ipDoPedido(headers: Headers): string | null {
  const candidato =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "";
  return /^[0-9A-Fa-f:.]{2,45}$/.test(candidato)
    ? candidato.toLowerCase()
    : null;
}
