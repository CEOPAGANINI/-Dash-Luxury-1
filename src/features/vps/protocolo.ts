import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { vpsServers } from "@/database/schema/vps";

import {
  canonicoPedido,
  chaveMestra,
  derivarChaves,
  hmacHex,
  iguaisTexto,
  sha256hex,
} from "./chaves";
import {
  controlCharacters,
  ESQUEMAS_DE_PARAMS,
  isPublicIpv4,
  R_SHA256,
  R_SLUG,
  R_UUID,
  TIPOS_DE_TAREFA,
  VpsError,
  type CodigoAgente,
  type ParamsDaTarefa,
  type TipoTarefa,
} from "./modelo";
import {
  consumirLimiteIp,
  ipDoPedido,
  LIMITE_AGENTE_POR_MINUTO,
} from "./limite-ip";
import type { BancoVps } from "./schema-sql";

/*
  O protocolo entre o painel e o agente da VPS (§4 e §5 da spec).

  Tudo que ENTRA do agente passa por zod depois do HMAC; tudo que SAI para
  o agente passa por um zod estrito, com números inteiros de verdade. O
  motivo é o driver: o postgres-js de produção devolve int8 como string no
  SQL cru, e o agente em Python recusa `"seq": "42"`. Se uma resposta não
  passar no schema, a rota responde 500 `erro_interno` e registra o erro;
  nunca manda string no lugar de número.

  Os códigos de erro da API do agente são em inglês e snake_case, e o par
  401 + `WWW-Authenticate: Dash-HMAC` + `{"error":"unauthorized"}` é a
  MARCA que o agente exige para se considerar revogado: um 401 da proteção
  da Vercel ou de um firewall não derruba o agente.
*/

/** Tetos de corpo por rota (bytes). O GET do artefato assina corpo vazio. */
export const LIMITE_CORPO = {
  registrar: 8 * 1024,
  pulso: 96 * 1024,
  resultado: 32 * 1024,
  artefato: 0,
} as const;

/** |seq − agora| aceito, em ms. Fora disso: 409 clock_skew. */
export const JANELA_SEQ_MS = 300_000;

/** Valor de WWW-Authenticate nos 401 do painel (o agente confere o prefixo). */
export const MARCA_DASH = "Dash-HMAC";

const R_BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;
/** Sem zero à esquerda: o texto do cabeçalho é o que entra no canônico. */
const R_SEQ = /^[1-9][0-9]{0,15}$/;
const R_ASSINATURA = /^v1=([0-9a-f]{64})$/;
const R_CODIGO = /^[A-Za-z0-9_-]{43}$/;

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

/** Toda resposta da API do agente: JSON e `Cache-Control: no-store`. */
export function respostaAgente(
  status: number,
  corpo: Record<string, unknown>,
  cabecalhos: Record<string, string> = {},
): Response {
  return Response.json(corpo, {
    status,
    headers: { "Cache-Control": "no-store", ...cabecalhos },
  });
}

export function respostaErroAgente(
  status: number,
  codigo: CodigoAgente,
  extra: Record<string, unknown> = {},
  cabecalhos: Record<string, string> = {},
): Response {
  return respostaAgente(
    status,
    { ok: false, error: codigo, ...extra },
    cabecalhos,
  );
}

/** O 401 uniforme dos passos 3 a 5 (servidor, token e assinatura). */
export function respostaNaoAutorizado(): Response {
  return respostaErroAgente(
    401,
    "unauthorized",
    {},
    { "WWW-Authenticate": MARCA_DASH },
  );
}

/**
 * Valida a saída contra o schema estrito antes de mandar. Falhou: 500
 * `erro_interno` e o motivo no log (sem os dados, que podem ter chave).
 */
export function respostaValidada(
  esquema: z.ZodType,
  dados: unknown,
  status = 200,
): Response {
  const r = esquema.safeParse(dados);
  if (!r.success) {
    console.error(
      "[vps] resposta inválida",
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
    return respostaErroAgente(500, "erro_interno");
  }
  return respostaAgente(status, r.data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Corpo
// ---------------------------------------------------------------------------

/**
 * Lê o corpo UMA vez, com teto: confere o Content-Length antes e o tamanho
 * real depois. O HMAC é conferido sobre estes bytes, antes de qualquer
 * JSON.parse.
 */
export async function lerCorpo(
  request: Request,
  limite: number,
): Promise<{ ok: true; corpo: Buffer } | { ok: false; resposta: Response }> {
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > limite)
    return { ok: false, resposta: respostaErroAgente(413, "too_large") };
  const corpo = Buffer.from(await request.arrayBuffer());
  if (corpo.length > limite)
    return { ok: false, resposta: respostaErroAgente(413, "too_large") };
  return { ok: true, corpo };
}

/** JSON.parse + zod do corpo já autenticado. Falhou: 400 invalid_request. */
export function interpretarCorpo<T extends z.ZodType>(
  corpo: Buffer,
  esquema: T,
): { ok: true; dados: z.infer<T> } | { ok: false; resposta: Response } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo.toString("utf8"));
  } catch {
    return { ok: false, resposta: respostaErroAgente(400, "invalid_request") };
  }
  const r = esquema.safeParse(bruto);
  if (!r.success)
    return { ok: false, resposta: respostaErroAgente(400, "invalid_request") };
  return { ok: true, dados: r.data };
}

// ---------------------------------------------------------------------------
// Verificação do pedido assinado
// ---------------------------------------------------------------------------

export type ServidorAutenticado = {
  id: string;
  workspaceId: string;
  status: "aguardando_confirmacao" | "ativo";
  geracao: number;
  lastPulseAt: Date | null;
};

export type PedidoVerificado =
  | { ok: true; servidor: ServidorAutenticado; seq: number }
  | { ok: false; resposta: Response };

/**
 * Autentica um pedido do agente (tudo menos `registrar`), nesta ordem:
 * 1. formato dos cabeçalhos (400) e tamanho do corpo (413);
 * 2. VPS_CHAVE_MESTRA presente (503) e freio por IP (429), antes do banco:
 *    cabeçalhos falsos com o formato certo custariam um SELECT cada, e o
 *    freio de 1 s do pulso só vem depois de uma assinatura válida;
 * 3. servidor vivo, confirmado ou aguardando confirmação, com token;
 * 4. sha256 do token;
 * 5. HMAC do canônico — 3, 4 e 5 falham com o MESMO 401 com a marca;
 * 6. janela de relógio (409 clock_skew com `agora` e `ultimaSeq`);
 * 7. seq estritamente maior que a última, gravada atomicamente (409 replayed).
 * `ultimaSeq` só vai depois da autenticação: não vaza nada a estranhos.
 */
export async function verificarPedido(
  db: BancoVps,
  request: Request,
  corpo: Buffer,
  opcoes: { limite?: number; agoraMs?: number } = {},
): Promise<PedidoVerificado> {
  const falha = (resposta: Response): PedidoVerificado => ({
    ok: false,
    resposta,
  });

  const token = R_BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  const servidorId = request.headers.get("x-dash-servidor") ?? "";
  const seqTexto = request.headers.get("x-dash-seq") ?? "";
  const assinatura = R_ASSINATURA.exec(
    request.headers.get("x-dash-assinatura") ?? "",
  )?.[1];
  const seq = Number(seqTexto);
  if (
    !token ||
    !assinatura ||
    !R_UUID.test(servidorId) ||
    !R_SEQ.test(seqTexto) ||
    !Number.isSafeInteger(seq)
  )
    return falha(respostaErroAgente(400, "invalid_request"));
  if (opcoes.limite !== undefined && corpo.length > opcoes.limite)
    return falha(respostaErroAgente(413, "too_large"));

  const mestra = chaveMestra();
  if (!mestra) return falha(respostaErroAgente(503, "not_configured"));

  const ip = ipDoPedido(request.headers) ?? "sem-ip";
  if (!consumirLimiteIp(`hmac:${ip}`, { limite: LIMITE_AGENTE_POR_MINUTO }))
    return falha(
      respostaErroAgente(
        429,
        "too_many_requests",
        { tenteEm: 60 },
        { "Retry-After": "60" },
      ),
    );

  const [srv] = await db
    .select({
      id: vpsServers.id,
      workspaceId: vpsServers.workspaceId,
      status: vpsServers.status,
      tokenHash: vpsServers.agentTokenHash,
      geracao: vpsServers.keyGeneration,
      ultimaSeq: vpsServers.agentLastSeq,
      lastPulseAt: vpsServers.lastPulseAt,
    })
    .from(vpsServers)
    .where(
      and(
        eq(vpsServers.id, servidorId),
        isNull(vpsServers.deletedAt),
        inArray(vpsServers.status, ["aguardando_confirmacao", "ativo"]),
        isNotNull(vpsServers.agentTokenHash),
      ),
    )
    .limit(1);
  if (!srv?.tokenHash) return falha(respostaNaoAutorizado());
  if (!iguaisTexto(sha256hex(token), srv.tokenHash))
    return falha(respostaNaoAutorizado());

  const { pedidos } = derivarChaves(mestra, srv.id, srv.geracao);
  const caminho = new URL(request.url).pathname;
  const esperado = hmacHex(
    pedidos,
    canonicoPedido(request.method, caminho, srv.id, seqTexto, corpo),
  );
  if (!iguaisTexto(esperado, assinatura)) return falha(respostaNaoAutorizado());

  const agora = opcoes.agoraMs ?? Date.now();
  if (Math.abs(seq - agora) > JANELA_SEQ_MS)
    return falha(
      respostaErroAgente(409, "clock_skew", {
        agora,
        ultimaSeq: srv.ultimaSeq,
      }),
    );

  const [avancou] = await db
    .update(vpsServers)
    .set({ agentLastSeq: seq, updatedAt: new Date() })
    .where(and(eq(vpsServers.id, srv.id), lt(vpsServers.agentLastSeq, seq)))
    .returning({ id: vpsServers.id });
  if (!avancou) {
    const [atual] = await db
      .select({ ultimaSeq: vpsServers.agentLastSeq })
      .from(vpsServers)
      .where(eq(vpsServers.id, srv.id))
      .limit(1);
    return falha(
      respostaErroAgente(409, "replayed", {
        ultimaSeq: atual?.ultimaSeq ?? srv.ultimaSeq,
      }),
    );
  }

  return {
    ok: true,
    seq,
    servidor: {
      id: srv.id,
      workspaceId: srv.workspaceId,
      status: srv.status as ServidorAutenticado["status"],
      geracao: srv.geracao,
      lastPulseAt: srv.lastPulseAt,
    },
  };
}

// ---------------------------------------------------------------------------
// O que ENTRA do agente (tolerante a campo novo: versões futuras do agente
// não derrubam o painel; o que importa é validado)
// ---------------------------------------------------------------------------

const textoLimpo = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => !controlCharacters.test(s), "caractere de controle");

/** IPv4 relatados: só os públicos ficam (o resto é descartado, não recusado). */
const listaIpv4 = z
  .array(z.string().max(15))
  .max(8)
  .transform((ips) => [...new Set(ips.filter(isPublicIpv4))]);
const listaIpv6 = z
  .array(
    z
      .string()
      .max(45)
      .regex(/^[0-9A-Fa-f:.]{2,45}$/)
      .transform((ip) => ip.toLowerCase()),
  )
  .max(8)
  .transform((ips) => [...new Set(ips)]);

const inteiro = () => z.number().int().safe();
const dataIso = z
  .string()
  .max(40)
  .refine((s) => Number.isFinite(Date.parse(s)), "data inválida");

export const PedidoRegistro = z.object({
  codigo: z.string().regex(R_CODIGO),
  tokenHash: z.string().regex(R_SHA256),
  agente: z.object({
    versao: textoLimpo(32),
    hostname: textoLimpo(253),
    so: textoLimpo(200),
    python: textoLimpo(32).nullable().default(null),
    nginx: textoLimpo(64).nullable().default(null),
    certbot: textoLimpo(64).nullable().default(null),
    ipv4: listaIpv4.default([]),
    ipv6: listaIpv6.default([]),
  }),
});
export type PedidoRegistroDados = z.infer<typeof PedidoRegistro>;

export const SiteInformado = z.object({
  slug: z.string().regex(R_SLUG),
  /** uuid da versão em current, "vazio" (página de espera) ou null (sem current). */
  atual: z.union([z.string().regex(R_UUID), z.literal("vazio")]).nullable(),
  versoes: z.array(z.string().regex(R_UUID)).max(50),
});

export const PedidoPulso = z.object({
  versao: textoLimpo(32),
  travas: z.object({ pausado: z.boolean(), somenteLeitura: z.boolean() }),
  executando: z.string().regex(R_UUID).nullable().default(null),
  desvioMs: inteiro().default(0),
  ipv4: listaIpv4.default([]),
  ipv6: listaIpv6.default([]),
  /** Saída crua do OVERVIEW; o parse (e o teto de 64 KB) é do painel. */
  visaoGeral: z.string().max(70_000).nullable().default(null),
  nginx: z
    .object({
      versao: textoLimpo(64).nullable(),
      configOk: z.boolean(),
      ativo: z.boolean(),
    })
    .nullable()
    .default(null),
  certificados: z
    .array(
      z.object({
        slug: z.string().regex(R_SLUG),
        validoAte: dataIso.nullable(),
      }),
    )
    .max(200)
    .nullable()
    .default(null),
  /** Vai em TODO pulso: é a base da reconciliação (§5.B, passo 4). */
  sites: z.array(SiteInformado).max(200).nullable().default(null),
});
export type PedidoPulsoDados = z.infer<typeof PedidoPulso>;

/** Limpa caracteres de controle (menos quebra de linha) e corta. */
export function limparErroDoAgente(erro: string, max = 2000): string {
  return erro
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "")
    .slice(0, max);
}

export const PedidoResultado = z.object({
  seq: inteiro().min(1),
  estado: z.enum(["concluida", "falhou"]),
  resultado: z.record(z.string(), z.unknown()).nullable().default(null),
  erro: z
    .string()
    .max(16_000)
    .nullable()
    .default(null)
    .transform((e) => (e === null ? null : limparErroDoAgente(e))),
  /** Cortado em 1 dia para caber no integer da coluna. */
  duracaoMs: inteiro()
    .min(0)
    .transform((ms) => Math.min(ms, 86_400_000)),
});
export type PedidoResultadoDados = z.infer<typeof PedidoResultado>;

const ativacao = {
  versaoId: z.string().regex(R_UUID),
  /** uuid da versão que estava no ar, "vazio" ou null (sem current antes). */
  anterior: z.string().max(80).nullable().optional(),
  ativadaEm: dataIso.optional(),
  repetida: z.boolean().optional(),
};

/** O `resultado` de cada tipo, conferido quando o estado é `concluida`. */
export const RESULTADO_POR_TIPO = {
  "servidor.coletar": z.object({ visaoGeral: z.string().max(70_000) }),
  "site.configurar": z.object({
    modo: z.enum(["http", "https"]),
    aplicadoEm: dataIso.optional(),
    /** "certificado_ausente": pediu HTTPS, o certificado não existe; caiu para HTTP. */
    aviso: z.string().max(64).optional(),
  }),
  "site.publicar": z.object({
    ...ativacao,
    // Na publicação repetida o agente relê estes números do marcador da
    // versão; um marcador sem eles não pode derrubar o resultado.
    arquivos: inteiro().min(0).nullable().optional(),
    bytesDescompactados: inteiro().min(0).nullable().optional(),
    indexSha256: z.string().regex(R_SHA256).nullable().optional(),
    /** Versões que a poda apagou do disco (viram `removida`). */
    removidas: z.array(z.string().regex(R_UUID)).max(100).default([]),
  }),
  "site.ativar_versao": z.object(ativacao),
  "site.ssl_emitir": z.object({
    validoAte: dataIso.nullable(),
    dominios: z.array(z.string().max(253)).max(4).optional(),
  }),
  /**
   * Sem pasta para mover (configurar que falhou, VPS trocada) não há
   * destino: o agente manda `{}`, e `movidoPara: null` também vale. Recusar
   * deixaria o site preso em `removendo` até o dono forçar a remoção.
   */
  "site.remover": z.object({
    movidoPara: z.string().max(512).nullable().optional(),
  }),
} satisfies Record<TipoTarefa, z.ZodType>;

export type ResultadoDaTarefa<T extends TipoTarefa> = z.infer<
  (typeof RESULTADO_POR_TIPO)[T]
>;

// ---------------------------------------------------------------------------
// O que SAI para o agente (estrito; números inteiros de verdade)
// ---------------------------------------------------------------------------

export const TarefaParaAgente = z.strictObject({
  id: z.string().regex(R_UUID),
  seq: inteiro().min(1),
  tipo: z.enum(TIPOS_DE_TAREFA),
  params: z.string().max(16_384),
  expiraEm: inteiro().min(0),
  assinatura: z.string().regex(R_SHA256),
});
export type TarefaParaAgenteDados = z.infer<typeof TarefaParaAgente>;

export const RespostaRegistro = z.strictObject({
  ok: z.literal(true),
  servidorId: z.string().regex(R_UUID),
  geracao: inteiro().min(1),
  chavePedidos: z.string().regex(R_CODIGO),
  chaveTarefas: z.string().regex(R_CODIGO),
  ultimaSeqTarefa: inteiro().min(0),
  proximoPulsoEm: inteiro().min(1).max(300),
});

export const RespostaPulso = z.strictObject({
  ok: z.literal(true),
  agora: z.string(),
  agoraMs: inteiro(),
  proximoPulsoEm: z.union([z.literal(5), z.literal(30)]),
  tarefa: TarefaParaAgente.nullable(),
});

// ---------------------------------------------------------------------------
// Tarefa assinada
// ---------------------------------------------------------------------------

/**
 * O JSON EXATO que vai assinado, com as chaves na ordem do schema zod.
 * Montado uma vez; o banco guarda o texto (text, não jsonb) e a entrega
 * devolve o mesmo texto.
 */
export function montarParams<T extends TipoTarefa>(
  tipo: T,
  params: ParamsDaTarefa<T>,
): string {
  const esquema: z.ZodType = ESQUEMAS_DE_PARAMS[tipo];
  const r = esquema.safeParse(params);
  if (!r.success)
    throw new VpsError(
      400,
      "dados_invalidos",
      `Parâmetros inválidos para ${tipo}: ${r.error.issues
        .map((i) => i.path.join(".") || i.message)
        .join(", ")}`,
    );
  return JSON.stringify(r.data);
}

/**
 * O envelope entregue ao agente, a partir da linha lida pelo QUERY BUILDER
 * (seq já é number). `expiraEm` volta do `expires_at` gravado como
 * `new Date(expiraEm * 1000)`: o arredondamento devolve o mesmo inteiro
 * que foi assinado. Ler a época pelo SQL cru é proibido aqui: o cast para
 * int8 arredonda, e o relógio do banco não é o que assinou.
 */
export function envelopeDaTarefa(linha: {
  id: string;
  seq: number;
  type: string;
  params: string;
  signature: string;
  expiresAt: Date;
}): TarefaParaAgenteDados {
  return TarefaParaAgente.parse({
    id: linha.id,
    seq: linha.seq,
    tipo: linha.type,
    params: linha.params,
    expiraEm: Math.round(linha.expiresAt.getTime() / 1000),
    assinatura: linha.signature,
  });
}
