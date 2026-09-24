import { and, eq, gte, lt, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { vpsOperationAttempts } from "@/database/schema/vps";
import { getAppUrl } from "@/lib/app-url";
import {
  DEMO_USER,
  getSession,
  momentoDaAutenticacao,
  type AppSession,
  type SessionUser,
} from "@/lib/auth/session";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import { chaveMestra } from "./chaves";
import {
  calcularHostsReservados,
  calcularOrigensPermitidas,
  emailValido,
  hostValido,
  VpsError,
} from "./modelo";
import {
  ensureVpsSchema,
  mensagemDeErroVps,
  type BancoVps,
} from "./schema-sql";

/*
  Quem pode comandar o Servidor do Funil, e em que condições (§6.1).

  Comandar a VPS é o poder mais alto do painel: quem publica no domínio do
  dono pode pôr uma página falsa no ar. Por isso a guarda é mais dura que a
  do resto do painel:
  - só quem está em VPS_DONOS (e-mail CONFIRMADO ou id da conta); lista
    vazia = ninguém opera;
  - modo demo nunca chega ao banco nem a VPS nenhuma;
  - publicar, trocar domínio/checkout e remover exigem login RECENTE da
    própria sessão (amr do JWT), para um cookie roubado valer pouco;
  - 10 ações por minuto por conta, contadas no banco (várias instâncias
    serverless dividem o mesmo limite).

  Este módulo é de servidor (sessão e banco). As rotas do agente não passam
  por aqui: quem autentica o agente é o HMAC (protocolo.ts).
*/

export type OpcoesDaGuarda = {
  /** A ação muda algo (exige VPS_CHAVE_MESTRA, que assina as tarefas). */
  alterar: boolean;
  /** Exige login recente desta sessão (VPS_LOGIN_RECENTE_HORAS). */
  recente?: boolean;
  /** Criar servidor / novo comando: exige https de produção e origem de checkout. */
  criarServidor?: boolean;
};

export type AcessoVps = {
  session: AppSession;
  db: BancoVps;
  workspaceId: string;
};

export type ChavePendencia =
  | "banco"
  | "donos"
  | "email_confirmado"
  | "chave"
  | "https"
  | "origem_checkout"
  | "tabelas";

/** Um item do bloco "Configuração": todas as pendências aparecem de uma vez. */
export type PendenciaVps = {
  chave: ChavePendencia;
  ok: boolean;
  texto: string;
  ondePegar: string;
};

// ---------------------------------------------------------------------------
// Configuração lida do ambiente
// ---------------------------------------------------------------------------

export type ConfiguracaoDoPainel = {
  /** getAppUrl(): o endereço que a VPS usa para falar com o painel. */
  appUrl: string;
  /** A origem do app, quando é https de produção (senão null). */
  painel: string | null;
  preview: boolean;
  /** Lista ORIGENS (§8.1): para onde o /checkout de um site pode ir. */
  origens: string[];
  /** Hosts que nenhum site da VPS pode usar (o do app e os das origens). */
  hostsReservados: string[];
};

export function configuracaoDoPainel(): ConfiguracaoDoPainel {
  const appUrl = getAppUrl();
  const extras = process.env.VPS_CHECKOUT_ORIGENS;
  let painel: string | null = null;
  try {
    const u = new URL(appUrl);
    if (u.protocol === "https:" && !u.port && hostValido(u.hostname))
      painel = u.origin;
  } catch {
    // sem URL válida: fica sem painel https
  }
  return {
    appUrl,
    painel,
    preview: process.env.VERCEL_ENV === "preview",
    origens: calcularOrigensPermitidas(appUrl, extras),
    hostsReservados: calcularHostsReservados(appUrl, extras),
  };
}

/** VPS_DONOS: itens com "@" são e-mails (minúsculos); sem "@", ids de conta. */
export function donosDaVps(): { emails: string[]; ids: string[] } {
  const itens = (process.env.VPS_DONOS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    emails: itens.filter((i) => i.includes("@")).map((i) => i.toLowerCase()),
    ids: itens.filter((i) => !i.includes("@")),
  };
}

/**
 * O e-mail só vale confirmado: sem isso, qualquer um que cadastrasse o
 * e-mail do dono (sem acesso à caixa dele) viraria dono da VPS.
 */
export function ehDonoDaVps(user: SessionUser): boolean {
  if (!user.id || user.id === DEMO_USER.id) return false;
  const { emails, ids } = donosDaVps();
  if (ids.includes(user.id)) return true;
  return (
    user.emailConfirmado === true &&
    Boolean(user.email) &&
    emails.includes(user.email.toLowerCase())
  );
}

/** VPS_LOGIN_RECENTE_HORAS (padrão 12; valor inválido também vira 12). */
export function horasDeLoginRecente(): number {
  const bruto = Number(process.env.VPS_LOGIN_RECENTE_HORAS);
  return Number.isFinite(bruto) && bruto > 0 && bruto <= 24 * 30 ? bruto : 12;
}

/** E-mail que vai para o certbot: o da sessão, confirmado e na regra estrita. */
export function emailDoCertbot(session: AppSession): string | null {
  const email = session.user.email;
  return session.user.emailConfirmado === true && email && emailValido(email)
    ? email
    : null;
}

// ---------------------------------------------------------------------------
// A guarda
// ---------------------------------------------------------------------------

/**
 * A guarda de tudo que o painel faz com a VPS, nesta ordem (cada passo
 * falha com VpsError(status, codigo, mensagem)):
 * 1. sem sessão: 401 sem_sessao;
 * 2. modo demo: 403 modo_demo (sem tocar no banco);
 * 3. fora de VPS_DONOS: 403 sem_permissao;
 * 4. sem DATABASE_URL: 503 sem_banco;
 * 5. tabelas que não dá para criar: 503 sem_tabelas;
 * 6. `alterar` sem VPS_CHAVE_MESTRA: 503 sem_chave;
 * 7. `criarServidor` fora do https de produção (ou em preview): 503
 *    sem_https; sem nenhuma origem de checkout: 503 sem_origem_checkout;
 * 8. `recente` com a autenticação desta sessão mais velha que o limite
 *    (ou desconhecida): 403 login_antigo.
 */
export async function exigirDonoDaVps(
  opcoes: OpcoesDaGuarda,
): Promise<AcessoVps> {
  const session = await getSession();
  if (!session)
    throw new VpsError(
      401,
      "sem_sessao",
      "Entre na sua conta para comandar o servidor.",
    );
  if (session.demoMode || session.user.id === DEMO_USER.id)
    throw new VpsError(403, "modo_demo", "Comandar servidor exige login real.");
  if (!ehDonoDaVps(session.user))
    throw new VpsError(
      403,
      "sem_permissao",
      `Sua conta (${session.user.email || session.user.id}) não está em VPS_DONOS (ou o e-mail não foi confirmado).`,
    );
  if (!isDatabaseConfigured())
    throw new VpsError(
      503,
      "sem_banco",
      "Configure DATABASE_URL na Vercel: o Servidor do Funil guarda servidores, sites e tarefas no banco.",
    );

  const db: BancoVps = getDb();
  try {
    await ensureVpsSchema(db);
  } catch (erro) {
    console.error("[vps] tabelas do Servidor do Funil indisponíveis", erro);
    throw new VpsError(503, "sem_tabelas", mensagemDeErroVps(erro));
  }

  if (opcoes.alterar && !chaveMestra())
    throw new VpsError(
      503,
      "sem_chave",
      "Configure VPS_CHAVE_MESTRA (32 caracteres ou mais; ex.: openssl rand -base64 48) na Vercel.",
    );

  if (opcoes.criarServidor) {
    const config = configuracaoDoPainel();
    if (!config.painel || config.preview)
      throw new VpsError(
        503,
        "sem_https",
        "Crie servidores só pelo endereço https de produção do painel (NEXT_PUBLIC_APP_URL). Em preview a Vercel protege as rotas e o agente não conseguiria falar com o painel.",
      );
    if (config.origens.length === 0)
      throw new VpsError(
        503,
        "sem_origem_checkout",
        "Nenhuma origem de checkout válida: o painel precisa estar em https de produção ou VPS_CHECKOUT_ORIGENS precisa ter uma origem https.",
      );
  }

  if (opcoes.recente) {
    const momento = await momentoDaAutenticacao();
    const limiteMs = horasDeLoginRecente() * 3_600_000;
    if (!momento || Date.now() - momento.getTime() > limiteMs)
      throw new VpsError(
        403,
        "login_antigo",
        `Por segurança, esta ação exige ter entrado nas últimas ${horasDeLoginRecente()} h. Entre de novo e repita.`,
      );
  }

  const workspaceId = await getOrCreateDefaultWorkspace();
  return { session, db, workspaceId };
}

/**
 * O bloco "Configuração": TODAS as pendências de uma vez, cada uma com o
 * que fazer e onde pegar o valor (em vez de mostrar uma, o dono corrigir e
 * descobrir a próxima).
 */
export async function preRequisitosVps(
  session: AppSession,
): Promise<PendenciaVps[]> {
  const config = configuracaoDoPainel();
  const { emails, ids } = donosDaVps();
  const banco = isDatabaseConfigured();
  const pelaConta = ids.includes(session.user.id);
  const donos = ehDonoDaVps(session.user);
  const emailOk = pelaConta || session.user.emailConfirmado === true;
  const chave = Boolean(chaveMestra());

  let tabelas = false;
  let detalheTabelas = "";
  if (banco) {
    try {
      await ensureVpsSchema(getDb());
      tabelas = true;
    } catch (erro) {
      detalheTabelas = mensagemDeErroVps(erro);
    }
  }

  const lista: PendenciaVps[] = [
    {
      chave: "banco",
      ok: banco,
      texto: banco
        ? "Banco de dados conectado (DATABASE_URL)."
        : "Falta DATABASE_URL: sem banco, nada do servidor fica guardado.",
      ondePegar:
        "Supabase → Project Settings → Database (pooler, porta 6543); cole em Vercel → Settings → Environment Variables.",
    },
    {
      chave: "donos",
      ok: donos,
      texto: donos
        ? "Sua conta está em VPS_DONOS."
        : emails.length + ids.length === 0
          ? "VPS_DONOS está vazia: ninguém pode comandar o servidor."
          : `Sua conta (${session.user.email || session.user.id}) não está em VPS_DONOS.`,
      ondePegar:
        "Vercel → Settings → Environment Variables: VPS_DONOS com seu e-mail ou o id da conta (vários separados por vírgula).",
    },
    {
      chave: "email_confirmado",
      ok: emailOk,
      texto: emailOk
        ? "E-mail da conta confirmado."
        : "O e-mail da sua conta não foi confirmado; em VPS_DONOS, e-mail só vale confirmado.",
      ondePegar:
        "Abra o link de confirmação que o Supabase enviou no cadastro (Supabase → Authentication → Users mostra a situação).",
    },
    {
      chave: "chave",
      ok: chave,
      texto: chave
        ? "VPS_CHAVE_MESTRA configurada."
        : "Falta VPS_CHAVE_MESTRA (32 caracteres ou mais): sem ela nenhuma tarefa é assinada.",
      ondePegar:
        "Gere com openssl rand -base64 48 e salve em Vercel → Settings → Environment Variables.",
    },
    {
      chave: "https",
      ok: Boolean(config.painel) && !config.preview,
      texto:
        config.painel && !config.preview
          ? `O painel responde em ${config.painel}.`
          : config.preview
            ? "Este é um deploy de preview: crie servidores só em produção."
            : `O painel está em ${config.appUrl}, que não é https de produção.`,
      ondePegar:
        "NEXT_PUBLIC_APP_URL na Vercel com o endereço https de produção (a variável entra no build: trocar exige redeploy).",
    },
    {
      chave: "origem_checkout",
      ok: config.origens.length > 0,
      texto:
        config.origens.length > 0
          ? `O /checkout dos sites pode ir para: ${config.origens.join(", ")}.`
          : "Nenhuma origem https para o /checkout dos sites.",
      ondePegar:
        "Vem do endereço https do painel; origens extras em VPS_CHECKOUT_ORIGENS (ex.: https://checkout.loja.com).",
    },
    {
      chave: "tabelas",
      ok: tabelas,
      texto: tabelas
        ? "Tabelas do Servidor do Funil prontas."
        : banco
          ? detalheTabelas ||
            "As tabelas do Servidor do Funil não puderam ser criadas."
          : "As tabelas dependem do banco (DATABASE_URL).",
      ondePegar:
        "O painel cria sozinho; se o banco recusar, rode src/database/migrations/0006_vps.sql no SQL Editor do Supabase.",
    },
  ];
  return lista;
}

// ---------------------------------------------------------------------------
// Limite de ações (do painel VPS anterior, agora por workspace)
// ---------------------------------------------------------------------------

export const LIMITE_DE_ACOES_POR_MINUTO = 10;

/**
 * Conta uma ação da conta e recusa a 11ª no mesmo minuto (429 `limite`). O
 * lock e o contador vivem no Postgres (advisory lock da transação), então
 * várias instâncias serverless dividem o mesmo limite. Linhas com mais de
 * um dia são apagadas no caminho. Vale para ações que mudam algo, DNS,
 * conferência pública e upload; o GET de estado não conta.
 */
export async function consumeVpsAttempt(
  db: BancoVps,
  workspaceId: string,
  userId: string,
  acao: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`vps:${userId}`}))`,
    );
    const [uso] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(vpsOperationAttempts)
      .where(
        and(
          eq(vpsOperationAttempts.ownerUserId, userId),
          gte(vpsOperationAttempts.at, sql`now() - interval '1 minute'`),
        ),
      );
    if (Number(uso?.total ?? 0) >= LIMITE_DE_ACOES_POR_MINUTO)
      throw new VpsError(
        429,
        "limite",
        "Limite de 10 operações por minuto atingido. Aguarde um minuto e tente de novo.",
      );
    await tx
      .delete(vpsOperationAttempts)
      .where(
        and(
          eq(vpsOperationAttempts.ownerUserId, userId),
          lt(vpsOperationAttempts.at, sql`now() - interval '1 day'`),
        ),
      );
    await tx
      .insert(vpsOperationAttempts)
      .values({ workspaceId, ownerUserId: userId, action: acao.slice(0, 64) });
  });
}

/**
 * Pedido do painel que muda algo por route handler (o upload do ZIP): só do
 * mesmo endereço do painel. Um formulário de outro site até levaria o
 * cookie, mas não consegue mandar o Origin do painel (o navegador escreve
 * esse cabeçalho). `sec-fetch-site: cross-site` também barra.
 */
export function requireVpsRequest(request: Request): void {
  let origem: string;
  try {
    origem = new URL(request.url).origin;
  } catch {
    throw new VpsError(
      403,
      "origem_invalida",
      "Origem da solicitação inválida.",
    );
  }
  if (
    request.headers.get("origin") !== origem ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new VpsError(
      403,
      "origem_invalida",
      "Solicitação bloqueada. Use o painel no mesmo endereço e tente de novo.",
    );
}
