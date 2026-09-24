import type { PendenciaVps } from "./acesso";
import { VPS_UPLOAD_MAX_BYTES } from "./file-paths";
import {
  formatarBytes,
  formatarData,
  formatarHora,
  type CodigoVps,
  type DominioDTO,
  type ReleaseDTO,
  type ServidorDTO,
  type SiteDTO,
  type TarefaDTO,
} from "./modelo";
import type { EstadoDoPainelVps, PainelVps } from "./queries";

/*
  O lado do navegador das telas do Servidor: os pedidos às rotas do painel
  (o polling do estado e o upload do ZIP), a cópia para a área de
  transferência e os textos derivados dos DTOs.

  Neutro de propósito, como modelo.ts: nada de banco, `node:*` ou
  `next/*`. Os tipos de queries.ts e acesso.ts entram só como `import type`
  (somem na compilação; o teste de arquitetura segue só os imports de
  valor). O `request()` veio do painel VPS anterior, com duas correções:
  redirect e 401 viram "sessão expirada" (o proxy manda a sessão vencida
  para /login, e o fetch segue o redirect e recebe HTML), e resposta que
  não é JSON deixa de virar erro genérico sem motivo.
*/

// ---------------------------------------------------------------------------
// Estado da tela
// ---------------------------------------------------------------------------

/** O que a ilha recebe da página e o que o polling devolve. */
export type EstadoDaTela = EstadoDoPainelVps & {
  /** VPS_CHAVE_MESTRA presente: dá para comandar o servidor. */
  podeAlterar: boolean;
  pendencias: PendenciaVps[];
};

type PainelOk = Extract<PainelVps, { estado: "ok" }>;

export function estadoDaTela(painel: PainelOk): EstadoDaTela {
  return {
    ...painel.dados,
    podeAlterar: painel.podeAlterar,
    pendencias: painel.pendencias,
  };
}

// ---------------------------------------------------------------------------
// Pedidos às rotas do painel
// ---------------------------------------------------------------------------

export const MENSAGEM_SESSAO_EXPIRADA = "Sua sessão expirou. Entre de novo.";

/** Erro de um pedido ao painel, com o tipo que a tela precisa distinguir. */
export class ErroDoPainel extends Error {
  constructor(
    /** sessao: 401 ou redirect para o login; falha: rede, 5xx, não-JSON. */
    public readonly tipo: "sessao" | "falha" | "recusado",
    mensagem: string,
    public readonly status: number | null = null,
    public readonly codigo: CodigoVps | null = null,
    /** O corpo JSON do erro, quando veio (ex.: `problemas` do ZIP). */
    public readonly corpo: Record<string, unknown> | null = null,
  ) {
    super(mensagem);
    this.name = "ErroDoPainel";
  }
}

const FALHA_DE_REDE =
  "Não foi possível falar com o painel. Confira a conexão e tente de novo.";

/**
 * Um pedido às rotas /api/painel/vps/*. Devolve o JSON quando o painel
 * responde `ok`; senão lança ErroDoPainel com o tipo certo.
 */
export async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
    });
  } catch {
    throw new ErroDoPainel("falha", FALHA_DE_REDE);
  }
  if (resposta.redirected || resposta.status === 401)
    throw new ErroDoPainel("sessao", MENSAGEM_SESSAO_EXPIRADA, resposta.status);

  let corpo: Record<string, unknown>;
  try {
    corpo = (await resposta.json()) as Record<string, unknown>;
  } catch {
    // HTML no lugar de JSON: página de erro da plataforma ou login.
    throw new ErroDoPainel(
      "falha",
      resposta.status >= 500
        ? "O painel falhou ao responder. Tente de novo em instantes."
        : "O painel não devolveu uma resposta válida. Tente de novo.",
      resposta.status,
    );
  }
  if (!resposta.ok || corpo.ok !== true) {
    const mensagem =
      typeof corpo.error === "string" && corpo.error
        ? corpo.error
        : "Não foi possível concluir o pedido.";
    const codigo =
      typeof corpo.codigo === "string" ? (corpo.codigo as CodigoVps) : null;
    throw new ErroDoPainel(
      resposta.status >= 500 ? "falha" : "recusado",
      mensagem,
      resposta.status,
      codigo,
      corpo,
    );
  }
  return corpo as T;
}

/** GET /api/painel/vps/estado: o polling das telas. */
export function lerEstado(filtro: {
  servidorId?: string;
  siteId?: string;
}): Promise<EstadoDaTela> {
  const busca = new URLSearchParams();
  if (filtro.servidorId) busca.set("servidor", filtro.servidorId);
  if (filtro.siteId) busca.set("site", filtro.siteId);
  const texto = busca.toString();
  return request<EstadoDaTela>(
    `/api/painel/vps/estado${texto ? `?${texto}` : ""}`,
  );
}

export type ProblemaDoEnvio = { arquivo: string; motivo: string };

export type EnvioDoZip =
  | { ok: true; versao: ReleaseDTO; tarefa: TarefaDTO; avisos: string[] }
  | {
      ok: false;
      mensagem: string;
      codigo: CodigoVps | null;
      /** A lista do 422: arquivo + motivo, em português. */
      problemas: ProblemaDoEnvio[];
    };

/**
 * POST /api/painel/vps/publicar (multipart). É rota, e não server action,
 * porque a action tem teto de 1 MB e o ZIP vai até 3 MB. Sessão vencida e
 * falha de rede sobem como ErroDoPainel; recusa do painel volta como dado.
 */
export async function enviarZip(
  siteId: string,
  arquivo: File,
): Promise<EnvioDoZip> {
  const formulario = new FormData();
  formulario.set("siteId", siteId);
  formulario.set("arquivo", arquivo);
  try {
    const corpo = await request<{
      versao: ReleaseDTO;
      tarefa: TarefaDTO;
      avisos?: string[];
    }>("/api/painel/vps/publicar", { method: "POST", body: formulario });
    return {
      ok: true,
      versao: corpo.versao,
      tarefa: corpo.tarefa,
      avisos: corpo.avisos ?? [],
    };
  } catch (erro) {
    if (erro instanceof ErroDoPainel && erro.tipo === "recusado") {
      const problemas = Array.isArray(erro.corpo?.problemas)
        ? (erro.corpo.problemas as unknown[]).filter(
            (p): p is ProblemaDoEnvio =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as ProblemaDoEnvio).arquivo === "string" &&
              typeof (p as ProblemaDoEnvio).motivo === "string",
          )
        : [];
      return {
        ok: false,
        mensagem: erro.message,
        codigo: erro.codigo,
        problemas,
      };
    }
    throw erro;
  }
}

/** A mesma regra da rota, antes de gastar o envio: .zip de 1 byte a 3 MB. */
export function problemaDoArquivo(arquivo: File): string | null {
  if (!/\.zip$/i.test(arquivo.name))
    return "Escolha um arquivo .zip (as páginas compactadas).";
  if (arquivo.size < 1) return "O ZIP está vazio.";
  if (arquivo.size > VPS_UPLOAD_MAX_BYTES)
    return `O ZIP tem ${formatarBytes(arquivo.size)} e o limite é 3 MB. Tire vídeos e imagens grandes (ou comprima) e envie de novo.`;
  return null;
}

/**
 * Copia para a área de transferência. Sem permissão (http, iframe, navegador
 * antigo), seleciona o texto do elemento para a pessoa copiar na mão.
 */
export async function copiarTexto(
  texto: string,
  elemento?: HTMLElement | null,
): Promise<"copiado" | "selecionado" | "falhou"> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return "copiado";
    }
  } catch {
    // cai no plano B
  }
  if (elemento) {
    const selecao = window.getSelection();
    const faixa = document.createRange();
    faixa.selectNodeContents(elemento);
    selecao?.removeAllRanges();
    selecao?.addRange(faixa);
    return "selecionado";
  }
  return "falhou";
}

// ---------------------------------------------------------------------------
// Textos derivados (a mesma frase em todas as telas)
// ---------------------------------------------------------------------------

/** A cor de um texto de estado: só por estas classes (ou data-tone). */
export type Tom = "success" | "warning" | "destructive" | "muted";

export const CLASSE_DO_TOM: Record<Tom, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export type Rotulo = { texto: string; tom: Tom };

/** "12 s", "7 min", "3 h", "2 d": a distância entre duas datas ISO. */
export function tempoDesde(
  quando: string | null | undefined,
  agora: string,
): string {
  if (!quando) return "—";
  const ms = Date.parse(agora) - Date.parse(quando);
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/**
 * O selo do servidor. A hora relativa é medida contra `agora` do próprio
 * estado (relógio do painel), e não contra o relógio do navegador: assim o
 * HTML do servidor e a hidratação dizem a mesma coisa.
 */
export function rotuloDoServidor(s: ServidorDTO, agora: string): Rotulo {
  switch (s.estado) {
    case "revogado":
      return { texto: "Revogado", tom: "destructive" };
    case "aguardando_confirmacao":
      return { texto: "Confirme que é seu", tom: "warning" };
    case "aguardando_agente":
      return s.instalacao
        ? {
            texto: `Aguardando instalação (vale até ${formatarHora(s.instalacao.expiraEm)})`,
            tom: "muted",
          }
        : { texto: "Comando vencido: gere outro", tom: "warning" };
    case "ativo":
      if (s.sinal.tipo === "online")
        return {
          texto: `Online · sinal há ${tempoDesde(s.sinal.ultimoPulsoEm, agora)}`,
          tom: "success",
        };
      if (s.sinal.tipo === "sem_sinal")
        return {
          texto: `Sem sinal há ${tempoDesde(s.sinal.ultimoPulsoEm, agora)}`,
          tom: "warning",
        };
      return { texto: "Sem sinal ainda", tom: "warning" };
  }
}

/** O que o dono lê sobre o DNS de um domínio (nunca "propagado"). */
export function rotuloDoDns(d: DominioDTO): Rotulo {
  const vistos = [...(d.detalhe.a ?? []), ...(d.detalhe.aaaa ?? [])];
  const mensagem = d.detalhe.mensagem;
  switch (d.dns) {
    case "ok":
      return { texto: mensagem ?? "Aponta para este servidor", tom: "success" };
    case "outro_ip":
      return {
        texto:
          mensagem ??
          `Aponta para outro IP${vistos.length ? ` (${vistos.join(", ")})` : ""}. Cloudflare: deixe a nuvem cinza.`,
        tom: "destructive",
      };
    case "sem_registro":
      return {
        texto: mensagem ?? "Sem registro A para este nome",
        tom: "warning",
      };
    case "aaaa_divergente":
      return {
        texto:
          mensagem ??
          "Há um AAAA para outro IP: apague o AAAA; o Let's Encrypt usa IPv6.",
        tom: "destructive",
      };
    case "erro_consulta":
      return {
        texto: mensagem ?? d.detalhe.erro ?? "A consulta de DNS falhou",
        tom: "warning",
      };
    case "nao_verificado":
      return { texto: "Ainda não verificado", tom: "muted" };
  }
}

/** DNS do site inteiro, numa palavra (a coluna da tabela de sites). */
export function rotuloDoDnsDoSite(site: SiteDTO): Rotulo {
  if (site.dominios.length === 0) return { texto: "—", tom: "muted" };
  if (site.dominios.every((d) => d.dns === "ok"))
    return { texto: "Certo", tom: "success" };
  if (site.dominios.every((d) => d.dns === "nao_verificado"))
    return { texto: "Não verificado", tom: "muted" };
  const certos = site.dominios.filter((d) => d.dns === "ok").length;
  return {
    texto: `${certos} de ${site.dominios.length} certos`,
    tom: "warning",
  };
}

export function rotuloDoHttps(https: SiteDTO["https"]): Rotulo {
  switch (https.estado) {
    case "ativo":
      return {
        texto: https.validoAte
          ? `Ativo até ${formatarData(https.validoAte)}`
          : "Ativo",
        tom: "success",
      };
    case "emitindo":
      return { texto: "Pedido em andamento", tom: "muted" };
    case "erro":
      return { texto: "Falhou", tom: "destructive" };
    case "sem_ssl":
      return { texto: "Sem HTTPS", tom: "muted" };
  }
}

/**
 * "No ar" só com a conferência pública `ok` (o painel buscou o domínio pelo
 * IP do servidor e o conteúdo bateu com a versão ativa). O que o agente
 * informa não basta.
 */
export function rotuloDoNoAr(noAr: SiteDTO["noAr"]): Rotulo {
  const hora = noAr.em ? ` (conferido ${formatarHora(noAr.em)})` : "";
  switch (noAr.estado) {
    case "ok":
      return { texto: `No ar${hora}`, tom: "success" };
    case "pagina_de_espera":
      return { texto: `Mostra a página de espera${hora}`, tom: "muted" };
    case "outra_coisa":
      return { texto: `Responde outra coisa${hora}`, tom: "warning" };
    case "erro":
      return { texto: `A conferência falhou${hora}`, tom: "destructive" };
    case "nao_conferido":
      return { texto: "Não conferido", tom: "muted" };
  }
}

/** O estado de uma versão, com a confirmação do agente quando existe. */
export function rotuloDaVersao(
  versao: ReleaseDTO,
  servidorInforma: string | null,
): Rotulo {
  switch (versao.estado) {
    case "no_servidor":
      if (versao.ativa)
        return servidorInforma === versao.id
          ? { texto: "Ativa no servidor", tom: "success" }
          : { texto: "Ativa (o servidor ainda não confirmou)", tom: "warning" };
      return { texto: "Guardada no servidor", tom: "muted" };
    case "enviando":
      return { texto: "Enviando…", tom: "muted" };
    case "falhou":
      return {
        texto: `Falhou: ${versao.erro ?? "o servidor não disse o motivo"}`,
        tom: "destructive",
      };
    case "removida":
      return { texto: "Removida", tom: "muted" };
  }
}

export function rotuloDaTarefa(t: TarefaDTO): Rotulo {
  switch (t.estado) {
    case "concluida":
      return { texto: t.rotuloEstado, tom: "success" };
    case "falhou":
    case "expirada":
    case "sem_resposta":
      return { texto: t.rotuloEstado, tom: "destructive" };
    default:
      return { texto: t.rotuloEstado, tom: "muted" };
  }
}

/** A tela tem algo andando: o polling passa de 15 s para 5 s. */
export function temAlgoAndando(estado: EstadoDaTela): boolean {
  if (
    estado.servidores.some(
      (s) =>
        s.estado === "aguardando_agente" ||
        s.estado === "aguardando_confirmacao",
    )
  )
    return true;
  if (
    estado.sites.some(
      (s) =>
        s.estado === "configurando" ||
        s.estado === "removendo" ||
        s.https.estado === "emitindo" ||
        s.versaoAtiva?.estado === "enviando",
    )
  )
    return true;
  if (
    estado.servidor?.tarefas.some(
      (t) => t.estado === "pendente" || t.estado === "entregue",
    )
  )
    return true;
  return Boolean(
    estado.site?.tarefaAberta ||
    estado.site?.versoes.some((v) => v.estado === "enviando"),
  );
}

/** Hosts que nenhum site pode usar: o do painel e os das origens de checkout. */
export function hostsReservadosDaTela(estado: EstadoDaTela): string[] {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(estado.appUrl).hostname);
  } catch {
    // sem host do painel para reservar
  }
  for (const origem of estado.origens)
    hosts.add(origem.replace(/^https:\/\//, ""));
  return [...hosts];
}

/** `<script>` do rastreio que vai no HTML do site (sem produto, sem atributo). */
export function snippetDoRastreio(
  appUrl: string,
  produto: string | null,
): string {
  const base = appUrl.replace(/\/$/, "");
  return produto
    ? `<script src="${base}/agente/v1/rastreio.js" data-produto="${produto}" defer></script>`
    : `<script src="${base}/agente/v1/rastreio.js" defer></script>`;
}
