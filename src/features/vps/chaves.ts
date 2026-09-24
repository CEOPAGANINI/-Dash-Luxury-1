import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { VpsError } from "./modelo";

/*
  Chaves e assinaturas do Servidor do Funil (só servidor; só node:crypto).

  Nada daqui fica no banco. As chaves de pedido (agente → painel) e de
  tarefa (painel → agente) são DERIVADAS de VPS_CHAVE_MESTRA + id do
  servidor + geração; girar a geração (remover, recusar, registrar de novo)
  invalida as duas sem guardar segredo nenhum. O token do agente nasce na
  VPS e o painel só guarda o sha256 dele. Um dump do banco não abre nada.

  O formato das mensagens é o contrato com public/agente/v1/dash_agent.py;
  os vetores ficam em tests/fixtures/vps/vetores-protocolo.json e são
  conferidos pelo vitest e pelo unittest.
*/

export const P_PEDIDO = "dash-vps-pedido-v1";
export const P_TAREFA = "dash-vps-tarefa-v1";

export function chaveMestra(): Buffer | null {
  const v = process.env.VPS_CHAVE_MESTRA?.trim();
  return v && v.length >= 32 ? Buffer.from(v, "utf8") : null;
}

/** Para quem já passou pela guarda: sem a chave, nenhuma tarefa é assinada. */
export function chaveMestraOuErro(): Buffer {
  const mestra = chaveMestra();
  if (!mestra)
    throw new VpsError(
      503,
      "sem_chave",
      "Configure VPS_CHAVE_MESTRA (32 caracteres ou mais) na Vercel.",
    );
  return mestra;
}

export function sha256hex(dados: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(dados).digest("hex");
}

export function hmacHex(chave: Buffer, mensagem: Buffer | string): string {
  return createHmac("sha256", chave).update(mensagem).digest("hex");
}

/** 32 bytes cada; viajam uma vez para o agente, no registro, em base64url. */
export function derivarChaves(
  mestra: Buffer,
  servidorId: string,
  geracao: number,
): { pedidos: Buffer; tarefas: Buffer } {
  const d = (rotulo: string) =>
    createHmac("sha256", mestra)
      .update(`${rotulo}:${servidorId}:${geracao}`)
      .digest();
  return { pedidos: d(P_PEDIDO), tarefas: d(P_TAREFA) };
}

/**
 * O texto que o agente assina em cada pedido. `caminho` é o pathname exato;
 * `seq` é o cabeçalho X-Dash-Seq como veio (já conferido: sem zero à
 * esquerda); um GET assina o corpo vazio.
 */
export const canonicoPedido = (
  metodo: string,
  caminho: string,
  servidorId: string,
  seq: string,
  corpo: Buffer | Uint8Array,
): string =>
  [P_PEDIDO, metodo, caminho, servidorId, seq, sha256hex(corpo)].join("\n");

/** O texto que o painel assina em cada tarefa. */
export const mensagemTarefa = (t: {
  servidorId: string;
  id: string;
  seq: number;
  tipo: string;
  expiraEm: number;
  params: string;
}): string =>
  [
    P_TAREFA,
    t.servidorId,
    t.id,
    String(t.seq),
    t.tipo,
    String(t.expiraEm),
    t.params,
  ].join("\n");

/** Comparação em tempo constante, com a checagem de tamanho antes. */
export const iguais = (a: Buffer, b: Buffer): boolean =>
  a.length === b.length && timingSafeEqual(a, b);

/** Mesma comparação para textos (hex de hash ou de assinatura). */
export const iguaisTexto = (a: string, b: string): boolean =>
  iguais(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

export const paraBase64Url = (dados: Buffer): string =>
  dados.toString("base64url");

/** Código de instalação de uso único: 32 bytes em base64url (43 caracteres). */
export function novoCodigoDeInstalacao(): string {
  return randomBytes(32).toString("base64url");
}
