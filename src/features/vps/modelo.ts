import { z } from "zod";

import { VPS_UPLOAD_MAX_BYTES } from "./file-paths";

/*
  Modelo do Servidor do Funil (VPS): tipos, regras e formatação que valem
  no navegador e no servidor.

  Este módulo é NEUTRO de propósito: não importa banco, `node:*` nem
  `next/*`. As telas "use client" o importam, e o teste de arquitetura
  (tests/unit/vps-arquitetura.test.ts) segue o grafo de imports para
  garantir que nada de servidor vaze para o bundle do navegador. Por isso
  a normalização de domínio usa `new URL` (WHATWG, igual no Node e no
  navegador) e não `node:url`.

  As regras de domínio, origem, checkout, e-mail e parâmetros de tarefa
  são as mesmas de public/agente/v1/dash_agent.py e dash_agent_root.py.
  Os três lados conferem tests/fixtures/vps/casos-validacao.json.
*/

// ---------------------------------------------------------------------------
// Leitura do servidor (formato do parser do painel VPS anterior)
// ---------------------------------------------------------------------------

export type VpsOverview = {
  sampledAt: string;
  hostname: string;
  os: string;
  uptimeSeconds: number | null;
  cpuPercent: number | null;
  cpuCores: number | null;
  memory: { usedBytes: number; totalBytes: number } | null;
  /** Filesystem mounted at /, not the configured website directory. */
  disk: { usedBytes: number; totalBytes: number } | null;
  users: Array<{ name: string; uid: number; home: string; shell: string }>;
  services: Array<{ name: string; state: string }>;
  warnings: string[];
};

/**
 * O que o banco guarda da leitura: sem a lista de usuários do sistema
 * (saiu do MVP e não é dado que o painel precise reter) e sem `sampledAt`,
 * que é a hora do parse no painel. A hora que a tela mostra é
 * `last_overview_at`.
 */
export type VpsOverviewSemUsuarios = Omit<VpsOverview, "users" | "sampledAt">;

export const VPS_INPUT_LIMITS = { name: 80 } as const;

export const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

/** v1 intentionally accepts only canonical public IPv4 literals, never DNS. */
export function isPublicIpv4(value: string): boolean {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value))
    return false;
  const [a, b, c, d] = value.split(".").map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return false;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 168 ||
        (b === 0 && (c === 0 || c === 2)) ||
        (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

// ---------------------------------------------------------------------------
// Estados (texto no banco, sem pgEnum)
// ---------------------------------------------------------------------------

export type EstadoServidor =
  "aguardando_agente" | "aguardando_confirmacao" | "ativo" | "revogado";
export type EstadoSite = "configurando" | "ativo" | "erro" | "removendo";
export type EstadoTls = "sem_ssl" | "emitindo" | "ativo" | "erro";
export type EstadoRelease = "enviando" | "no_servidor" | "falhou" | "removida";
export type EstadoTarefa =
  | "pendente"
  | "entregue"
  | "concluida"
  | "falhou"
  | "expirada"
  | "sem_resposta";
export type EstadoDns =
  | "nao_verificado"
  | "ok"
  | "outro_ip"
  | "sem_registro"
  | "aaaa_divergente"
  | "erro_consulta";
export type EstadoNoAr =
  "nao_conferido" | "ok" | "pagina_de_espera" | "outra_coisa" | "erro";

/** Tarefas que ainda podem mudar de estado (as do índice de "site ocupado"). */
export const ESTADOS_TAREFA_ABERTA = ["pendente", "entregue"] as const;

// ---------------------------------------------------------------------------
// Tipos das colunas jsonb (todos com campos opcionais: o default é {})
// ---------------------------------------------------------------------------

/** O nginx como o agente informa no pulso (no registro só vem a versão). */
export type NginxInformado = {
  versao: string | null;
  configOk: boolean | null;
  ativo: boolean | null;
};

export type CapacidadesVps = {
  python?: string | null;
  certbot?: string | null;
  nginx?: NginxInformado | null;
  /** Desvio do relógio da VPS em relação ao painel, aprendido pelo agente. */
  desvioRelogioMs?: number | null;
};

/** Resultado da conferência "No ar", feita pelo painel pelo lado de fora. */
export type ConferenciaPublica = {
  estado?: Exclude<EstadoNoAr, "nao_conferido">;
  url?: string;
  /** ISO da conferência. */
  em?: string;
  detalhe?: string | null;
  /** Código HTTP visto, quando houve resposta. */
  status?: number | null;
  /** Versão ativa no painel quando a conferência rodou. */
  versaoId?: string | null;
};

export type DetalheDns = {
  a?: string[];
  aaaa?: string[];
  esperadosV4?: string[];
  esperadosV6?: string[];
  /** Frase pronta para a tela ("Cloudflare: deixe a nuvem cinza", …). */
  mensagem?: string;
  erro?: string | null;
};

/** Páginas do funil achadas no ZIP (caminhos relativos à raiz do site). */
export type PaginasDoFunil = {
  landing?: string | null;
  obrigado?: string | null;
  upsell?: string | null;
  downsell?: string | null;
  legais?: string[];
};

// ---------------------------------------------------------------------------
// Regras compartilhadas com o agente (§8.1)
// ---------------------------------------------------------------------------

export const R_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const R_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const R_SHA256 = /^[0-9a-f]{64}$/;
export const R_ROTULO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const R_TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
/** Parte local do e-mail: nunca começa com "-" (viraria opção do certbot). */
export const R_LOCAL_EMAIL = /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}$/;
export const R_SLUG_CHECKOUT = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
/**
 * Segmento de caminho dentro do ZIP: sem ponto inicial (nada de arquivo
 * oculto nem '..'), sem caractere de controle e sem / \ < > : " | ? *.
 * Aceita o que o editor do funil exporta (site-package.ts), menos o
 * arquivo oculto, que o nginx do site nunca serve. O resto da regra está
 * em segmentoDoZipOk.
 */
export const R_SEGMENTO =
  /^[^.\x00-\x1f\x7f-\x9f\/\\<>:"|?*][^\x00-\x1f\x7f-\x9f\/\\<>:"|?*]*$/u;
/** Nome de arquivo no Linux da VPS: até 255 BYTES (NAME_MAX). */
export const SEGMENTO_MAX_BYTES = 255;
/** Ignorados sem recusar: pastas de sistema e nomes de sistema (e "._*"). */
export const IGNORAR_NO_ZIP = ["__MACOSX/"] as const;
export const IGNORAR_NOME = [
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".htaccess",
] as const;

/**
 * Lixo de sistema que o Servidor e o agente descartam sem recusar o ZIP:
 * __MACOSX/, .DS_Store, Thumbs.db, desktop.ini, .htaccess e os "._*" que
 * o macOS cria em pendrive e pasta de rede. O editor do funil tira os
 * mesmos antes de gerar o ZIP.
 */
export function ehArquivoDeSistema(caminho: string): boolean {
  const base = caminho.slice(caminho.lastIndexOf("/") + 1);
  return (
    IGNORAR_NO_ZIP.some((prefixo) => caminho.startsWith(prefixo)) ||
    (IGNORAR_NOME as readonly string[]).includes(base) ||
    base.startsWith("._")
  );
}

/**
 * Teto do index.html: é o que a conferência "No ar" baixa para comparar o
 * sha256. O Servidor recusa acima disto, e o editor do funil não gera.
 */
export const INDEX_HTML_MAX_BYTES = 2 << 20;
export const R_IPV4_FORMA = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const utf8 = new TextEncoder();

/**
 * Igual a segmento_ok do agente. Com acento, só vale nome marcado como
 * UTF-8 no ZIP (bit 11) e já em NFC, que é como o editor do funil grava:
 * sem a marca, o Python lê o nome como cp437 (e grava outro nome no
 * disco); em NFD (ZIP do macOS), o arquivo no disco não casa com o link
 * em NFC do HTML.
 */
export function segmentoDoZipOk(segmento: string, marcadoUtf8: boolean) {
  if (
    !R_SEGMENTO.test(segmento) ||
    utf8.encode(segmento).length > SEGMENTO_MAX_BYTES
  )
    return false;
  return (
    /^[\x00-\x7f]*$/.test(segmento) ||
    (marcadoUtf8 && segmento.normalize("NFC") === segmento)
  );
}

export const SUFIXOS_BASE = [
  "localhost",
  "local",
  "internal",
  "invalid",
  "test",
  "example",
  "arpa",
] as const;
/** Um site na VPS não pode ser *.vercel.app; a ORIGEM do app pode. */
export const SUFIXOS_SITE = [...SUFIXOS_BASE, "vercel.app"] as const;

function temSufixo(dominio: string, lista: readonly string[]): boolean {
  return lista.some((s) => dominio === s || dominio.endsWith(`.${s}`));
}

/**
 * Normaliza o que o dono digitou num domínio: minúsculo, punycode e IPv4
 * canônico (`Promoção.com.BR` → `xn--promoo-7ta5a.com.br`, `0x7f.1` →
 * `127.0.0.1`, que depois cai na regra HOST). Recusa antes qualquer coisa
 * que faria o `URL` interpretar outra parte (porta, caminho, usuário).
 * Devolve null quando não dá para normalizar; não valida a regra HOST.
 */
export function normalizarHost(entrada: unknown): string | null {
  if (typeof entrada !== "string") return null;
  const bruto = entrada.trim();
  if (
    !bruto ||
    bruto.length > 300 ||
    /[/:@?#\\\s]/.test(bruto) ||
    controlCharacters.test(bruto)
  )
    return null;
  let host: string;
  try {
    host = new URL(`http://${bruto}`).hostname;
  } catch {
    return null;
  }
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host || null;
}

/** HOST: nome público já normalizado (minúsculo, punycode). */
export function hostValido(dominio: unknown): dominio is string {
  if (
    typeof dominio !== "string" ||
    dominio.length > 253 ||
    R_IPV4_FORMA.test(dominio)
  )
    return false;
  const partes = dominio.split(".");
  return (
    partes.length >= 2 &&
    partes.every((p) => R_ROTULO.test(p)) &&
    R_TLD.test(partes[partes.length - 1]) &&
    !temSufixo(dominio, SUFIXOS_BASE)
  );
}

/**
 * DOMINIO_SITE: HOST que pode ser servido pela VPS. `hostsReservados` são o
 * host do app e os das origens de checkout (a VPS não pode tomar o domínio
 * do próprio painel); o agente não conhece essa lista e só aplica os sufixos.
 */
export function dominioDoSiteValido(
  dominio: unknown,
  hostsReservados: readonly string[] = [],
): dominio is string {
  return (
    hostValido(dominio) &&
    !temSufixo(dominio, SUFIXOS_SITE) &&
    !hostsReservados.includes(dominio)
  );
}

/** ORIGEM: `https://` + HOST, sem porta e sem caminho (aceita *.vercel.app). */
export function origemValida(origem: unknown): origem is string {
  return (
    typeof origem === "string" &&
    origem.startsWith("https://") &&
    hostValido(origem.slice(8))
  );
}

/**
 * CHECKOUT: `<origem>/checkout/<slug>` ou null. A origem também passa pela
 * regra ORIGEM, como no agente: sozinha, esta função nunca aceita um
 * checkout em http:// (o caso está em casos-validacao.json).
 */
export function checkoutValido(url: unknown, origem: string): boolean {
  if (url === null) return true;
  return (
    typeof url === "string" &&
    origemValida(origem) &&
    url.startsWith(`${origem}/checkout/`) &&
    R_SLUG_CHECKOUT.test(url.slice(origem.length + 10))
  );
}

/** EMAIL para o certbot: null vale (vira --register-unsafely-without-email). */
export function emailValido(email: unknown): boolean {
  if (email === null) return true;
  if (typeof email !== "string" || email.length > 254) return false;
  const partes = email.split("@");
  if (partes.length !== 2) return false;
  return R_LOCAL_EMAIL.test(partes[0]) && hostValido(partes[1].toLowerCase());
}

/** Lê um domínio digitado: normaliza e aplica DOMINIO_SITE. */
export function lerDominioDoSite(
  entrada: unknown,
  hostsReservados: readonly string[] = [],
): string | null {
  const host = normalizarHost(entrada);
  return host && dominioDoSiteValido(host, hostsReservados) ? host : null;
}

/**
 * A lista ORIGENS: a origem do app (só se for https e passar em HOST) mais
 * os itens válidos de VPS_CHECKOUT_ORIGENS (separados por vírgula). Função
 * pura: quem chama passa `getAppUrl()` e o env, porque o env do servidor
 * não existe no navegador.
 */
export function calcularOrigensPermitidas(
  appUrl: string | null | undefined,
  extras: string | null | undefined,
): string[] {
  const lista: string[] = [];
  const incluir = (origem: string) => {
    if (origemValida(origem) && !lista.includes(origem)) lista.push(origem);
  };
  if (appUrl) {
    try {
      const u = new URL(appUrl);
      if (u.protocol === "https:" && !u.port) incluir(u.origin);
    } catch {
      // app sem URL válida: fica fora da lista
    }
  }
  for (const item of (extras ?? "").split(",")) {
    const bruto = item.trim().replace(/\/$/, "");
    if (bruto) incluir(bruto);
  }
  return lista;
}

/** Hosts que nenhum site da VPS pode usar: o do app e os das origens extras. */
export function calcularHostsReservados(
  appUrl: string | null | undefined,
  extras: string | null | undefined,
): string[] {
  const hosts = new Set<string>();
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).hostname);
    } catch {
      // sem host para reservar
    }
  }
  for (const origem of calcularOrigensPermitidas(null, extras))
    hosts.add(origem.slice(8));
  return [...hosts];
}

/** Slug da pasta do site: sem acento, minúsculo, até 40 caracteres. */
export function derivarSlug(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "site";
}

/**
 * Slugs que nenhum site recebe. As instalações antigas gravaram o servidor
 * padrão do nginx (o catch-all que fecha a conexão para Host desconhecido)
 * em `dash-000-padrao.conf`, o mesmo arquivo `dash-<slug>.conf` de um site
 * chamado "000 Padrão": aplicar esse site apagaria o catch-all. O instalador
 * agora usa `dash--padrao.conf`, que slug nenhum forma; a reserva continua
 * como defesa para as VPS instaladas antes. O agente e o ajudante root
 * recusam a mesma lista (SLUGS_RESERVADOS nos dois .py).
 */
export const SLUGS_RESERVADOS: readonly string[] = ["000-padrao"];

/** SLUG (§8.1): a regex e fora da lista de reservados. */
export function slugValido(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    R_SLUG.test(valor) &&
    !SLUGS_RESERVADOS.includes(valor)
  );
}

/**
 * Se o slug já existe no servidor (ou é reservado), recebe `-2`, `-3`…
 * sem passar de 40.
 */
export function slugLivre(base: string, usados: Iterable<string>): string {
  const ocupados = new Set([...usados, ...SLUGS_RESERVADOS]);
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) {
    const sufixo = `-${n}`;
    const candidato = `${base.slice(0, 40 - sufixo.length).replace(/-+$/g, "")}${sufixo}`;
    if (!ocupados.has(candidato)) return candidato;
  }
}

/**
 * IPs para onde os domínios devem apontar: o IP informado pelo dono vence;
 * senão, os IPv4 públicos relatados mais o IP visto no registro/pulso
 * (quando público). IPv6 só os relatados.
 */
export function ipsEsperados(servidor: {
  ipOverride: string | null;
  publicIpv4: string[];
  publicIpv6: string[];
  lastSeenIp: string | null;
}): { ipv4: string[]; ipv6: string[] } {
  const ipv6 = [...new Set(servidor.publicIpv6.map((ip) => ip.toLowerCase()))];
  if (servidor.ipOverride && isPublicIpv4(servidor.ipOverride))
    return { ipv4: [servidor.ipOverride], ipv6 };
  const ipv4 = new Set(servidor.publicIpv4.filter(isPublicIpv4));
  if (servidor.lastSeenIp && isPublicIpv4(servidor.lastSeenIp))
    ipv4.add(servidor.lastSeenIp);
  return { ipv4: [...ipv4], ipv6 };
}

// ---------------------------------------------------------------------------
// Tarefas painel → agente (§8.2): chaves EXATAS por tipo
// ---------------------------------------------------------------------------

export const TIPOS_DE_TAREFA = [
  "servidor.coletar",
  "site.configurar",
  "site.publicar",
  "site.ativar_versao",
  "site.ssl_emitir",
  "site.remover",
] as const;
export type TipoTarefa = (typeof TIPOS_DE_TAREFA)[number];

export function ehTipoDeTarefa(valor: unknown): valor is TipoTarefa {
  return (TIPOS_DE_TAREFA as readonly unknown[]).includes(valor);
}

const campoUuid = z.string().regex(R_UUID);
const campoSlug = z.string().refine(slugValido, "slug inválido ou reservado");
const campoDominios = z
  .array(z.string())
  .min(1)
  .max(4)
  .refine((ds) => new Set(ds).size === ds.length, "domínio repetido")
  .refine((ds) => ds.every((d) => dominioDoSiteValido(d)), "domínio inválido");

/**
 * Os parâmetros de cada tipo, na ORDEM em que entram no JSON assinado
 * (`montarParams` serializa a saída do zod, que segue a ordem do schema).
 * Chave extra é recusada, como no agente.
 */
export const ESQUEMAS_DE_PARAMS = {
  "servidor.coletar": z.strictObject({}),
  "site.configurar": z
    .strictObject({
      siteId: campoUuid,
      slug: campoSlug,
      dominios: campoDominios,
      principal: z.string(),
      origemCheckout: z.string().refine(origemValida, "origem inválida"),
      checkout: z.string().nullable(),
      tls: z.boolean(),
    })
    .refine((p) => p.dominios.includes(p.principal), {
      message: "o principal precisa estar entre os domínios",
      path: ["principal"],
    })
    .refine((p) => checkoutValido(p.checkout, p.origemCheckout), {
      message: "checkout fora da origem",
      path: ["checkout"],
    }),
  "site.publicar": z.strictObject({
    siteId: campoUuid,
    slug: campoSlug,
    versaoId: campoUuid,
    artefatoId: campoUuid,
    sha256: z.string().regex(R_SHA256),
    bytes: z.number().int().min(1).max(VPS_UPLOAD_MAX_BYTES),
  }),
  "site.ativar_versao": z.strictObject({
    siteId: campoUuid,
    slug: campoSlug,
    versaoId: campoUuid,
  }),
  "site.ssl_emitir": z.strictObject({
    siteId: campoUuid,
    slug: campoSlug,
    dominios: campoDominios,
    email: z.string().nullable().refine(emailValido, "e-mail inválido"),
  }),
  "site.remover": z.strictObject({ siteId: campoUuid, slug: campoSlug }),
} satisfies Record<TipoTarefa, z.ZodType>;

export type ParamsDaTarefa<T extends TipoTarefa = TipoTarefa> = z.infer<
  (typeof ESQUEMAS_DE_PARAMS)[T]
>;

/** Chaves exatas por tipo, na mesma ordem do dicionário TIPOS do agente. */
export const CHAVES_POR_TIPO: Record<TipoTarefa, readonly string[]> = {
  "servidor.coletar": [],
  "site.configurar": [
    "siteId",
    "slug",
    "dominios",
    "principal",
    "origemCheckout",
    "checkout",
    "tls",
  ],
  "site.publicar": [
    "siteId",
    "slug",
    "versaoId",
    "artefatoId",
    "sha256",
    "bytes",
  ],
  "site.ativar_versao": ["siteId", "slug", "versaoId"],
  "site.ssl_emitir": ["siteId", "slug", "dominios", "email"],
  "site.remover": ["siteId", "slug"],
};

export const ROTULO_DO_TIPO: Record<TipoTarefa, string> = {
  "servidor.coletar": "Ler o servidor",
  "site.configurar": "Configurar o site",
  "site.publicar": "Publicar versão",
  "site.ativar_versao": "Voltar para uma versão",
  "site.ssl_emitir": "Pedir HTTPS",
  "site.remover": "Remover o site",
};

export const ROTULO_DO_ESTADO_DA_TAREFA: Record<EstadoTarefa, string> = {
  pendente: "Na fila: o servidor busca em até 30 s",
  entregue: "Em execução no servidor",
  concluida: "Concluída",
  falhou: "Falhou",
  expirada: "O servidor não buscou em 10 min (desligado ou pausado?)",
  sem_resposta: "Começou e não respondeu",
};

// ---------------------------------------------------------------------------
// Página de espera: o que `vazio/index.html` serve antes do primeiro ZIP.
// ASCII puro (acento em entidade HTML) para os bytes serem idênticos no
// Python e no TS; a conferência "No ar" compara o corpo com esta constante.
// ---------------------------------------------------------------------------

export const PAGINA_DE_ESPERA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Em breve</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fafafa;color:#333}p{margin:0;padding:24px;text-align:center}</style>
</head>
<body>
<p>Este site ainda n&atilde;o foi publicado.</p>
</body>
</html>
`;

/** Tela e agente: o certificado sumiu do servidor e o site voltou a HTTP. */
export const MENSAGEM_CERTIFICADO_AUSENTE =
  "O certificado não existe neste servidor. O HTTPS será pedido de novo quando o DNS estiver certo.";

/** Um pulso mais novo que isto conta como "Online". */
export const SINAL_ONLINE_MS = 90_000;

export function sinalDoServidor(
  ultimoPulsoEm: Date | string | null,
  agora: Date = new Date(),
): "nunca" | "online" | "sem_sinal" {
  if (!ultimoPulsoEm) return "nunca";
  const quando = new Date(ultimoPulsoEm).getTime();
  return agora.getTime() - quando < SINAL_ONLINE_MS ? "online" : "sem_sinal";
}

// ---------------------------------------------------------------------------
// Erros e resultados
// ---------------------------------------------------------------------------

/** Códigos do painel (telas, actions e rotas do painel). */
export const CODIGOS_VPS = [
  "sem_sessao",
  "modo_demo",
  "sem_permissao",
  "sem_banco",
  "sem_tabelas",
  "sem_chave",
  "sem_https",
  "sem_origem_checkout",
  "login_antigo",
  "limite",
  "origem_invalida",
  "dados_invalidos",
  "nao_encontrado",
  "estado_invalido",
  "servidor_nao_pronto",
  "site_ocupado",
  "dominio_em_uso",
  "dns_pendente",
  "ssl_aguarde",
  "muito_grande",
  "zip_com_problemas",
  "erro_banco",
  "erro_interno",
] as const;
export type CodigoVps = (typeof CODIGOS_VPS)[number];

/** Códigos da API do agente (snake_case em inglês, como o agente espera). */
export const CODIGOS_AGENTE = [
  "invalid_request",
  "too_large",
  "not_configured",
  "database_not_configured",
  "tables_missing",
  "unauthorized",
  "invalid_code",
  "clock_skew",
  "replayed",
  "too_many_requests",
  "job_not_found",
  "job_not_delivered",
  "not_found",
  "erro_interno",
] as const;
export type CodigoAgente = (typeof CODIGOS_AGENTE)[number];

/** Erro conhecido: vira resposta com o próprio status e código. */
export class VpsError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: CodigoVps | CodigoAgente,
    mensagem: string,
    /** Campos a mais na resposta (ex.: `{ tenteEm: 5 }`). */
    public readonly extra?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = "VpsError";
  }
}

/** Retorno das server actions (formato do useActionState). */
export type ResultadoVps<D = unknown> = {
  ok: boolean;
  mensagem: string;
  codigo?: CodigoVps;
  erros?: Record<string, string>;
  dados?: D;
};

// ---------------------------------------------------------------------------
// DTOs das telas (§6.2). Nenhum carrega hash, params, assinatura ou ZIP.
// Datas saem como ISO de `Date` do query builder.
// ---------------------------------------------------------------------------

export type MedidaDTO = { usadoBytes: number; totalBytes: number };

export type LeituraDTO = {
  /** = last_overview_at */
  em: string;
  cpuPercent: number | null;
  cpuCores: number | null;
  memoria: MedidaDTO | null;
  disco: MedidaDTO | null;
  uptimeSegundos: number | null;
  avisos: string[];
};

export type ServidorDTO = {
  id: string;
  nome: string;
  estado: EstadoServidor;
  /** online = pulso há menos de 90 s. */
  sinal: {
    tipo: "nunca" | "online" | "sem_sinal";
    ultimoPulsoEm: string | null;
  };
  instalacao: { expiraEm: string } | null;
  registro: {
    hostname: string | null;
    so: string | null;
    ipVisto: string | null;
    ipsPublicos: string[];
    registradoEm: string | null;
  } | null;
  /** O IPv4 para onde o DNS deve apontar (primeiro de `ipsEsperados`). */
  ipDoDns: string | null;
  ipInformado: string | null;
  versaoAgente: string | null;
  travas: { pausado: boolean; somenteLeitura: boolean };
  geracaoChave: number;
  /** Só quando |desvio| > 60 s. */
  relogio: { desvioSegundos: number } | null;
  nginx: NginxInformado | null;
  leitura: LeituraDTO | null;
  erroLeitura: string | null;
  totalSites: number;
};

export type DominioDTO = {
  hostname: string;
  principal: boolean;
  dns: EstadoDns;
  verificadoEm: string | null;
  detalhe: DetalheDns;
};

export type ReleaseDTO = {
  id: string;
  arquivo: string | null;
  criadaEm: string;
  por: string;
  arquivos: number;
  /** Bytes descompactados (declarados no ZIP). */
  bytes: number;
  bytesZip: number;
  paginas: PaginasDoFunil;
  temRastreio: boolean;
  estado: EstadoRelease;
  ativa: boolean;
  ativadaEm: string | null;
  erro: string | null;
  avisos: string[];
};

export type TarefaDTO = {
  id: string;
  tipo: TipoTarefa;
  rotulo: string;
  estado: EstadoTarefa;
  rotuloEstado: string;
  criadaEm: string;
  entregueEm: string | null;
  concluidaEm: string | null;
  expiraEm: string;
  erro: string | null;
  por: string;
};

export type SiteDTO = {
  id: string;
  servidorId: string;
  servidorNome: string;
  nome: string;
  slug: string;
  estado: EstadoSite;
  dominios: DominioDTO[];
  /** aviso: checkout despublicado ou apagado. */
  checkout: { origem: string; url: string | null; aviso: string | null };
  nginx: { aplicadoEm: string | null; erro: string | null };
  https: {
    estado: EstadoTls;
    validoAte: string | null;
    /** tls_checked_at: quando a validade foi lida do certificado na VPS. */
    conferidoEm: string | null;
    erro: string | null;
    podeTentarEm: string | null;
  };
  /** De reported_present: null = o agente nunca informou. */
  naVps: "presente" | "ausente" | "desconhecido";
  versaoAtiva: ReleaseDTO | null;
  /** O que o agente diz ter em current (uuid da versão ou "vazio"). */
  servidorInforma: string | null;
  /** productSlug do checkout escolhido (vai no snippet do rastreio). */
  rastreioProduto: string | null;
  noAr: {
    estado: EstadoNoAr;
    url: string | null;
    em: string | null;
    detalhe: string | null;
  };
};

export type ServidorDetalheDTO = ServidorDTO & {
  ipsEsperados: { ipv4: string[]; ipv6: string[] };
  confirmado: { em: string; por: string | null } | null;
  sites: SiteDTO[];
  /** As 20 mais recentes. */
  tarefas: TarefaDTO[];
};

export type SiteDetalheDTO = SiteDTO & {
  ipsEsperados: { ipv4: string[]; ipv6: string[] };
  /** As 5 mais recentes. */
  versoes: ReleaseDTO[];
  tarefas: TarefaDTO[];
  tarefaAberta: TarefaDTO | null;
  /** Remoção que falhou, expirou ou ficou sem resposta, ou servidor removido. */
  podeForcarRemocao: boolean;
};

// ---------------------------------------------------------------------------
// Formatação (sempre no fuso de São Paulo: sem isso, a Vercel formataria
// em UTC no servidor e a hora mudaria entre o HTML e a hidratação)
// ---------------------------------------------------------------------------

export const FUSO_DO_PAINEL = "America/Sao_Paulo";

function paraData(valor: Date | string | null | undefined): Date | null {
  if (valor == null) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(data.getTime()) ? data : null;
}

/** "21:10" */
export function formatarHora(valor: Date | string | null | undefined): string {
  const data = paraData(valor);
  if (!data) return "—";
  return data.toLocaleTimeString("pt-BR", {
    timeZone: FUSO_DO_PAINEL,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "23/09/2026" */
export function formatarData(valor: Date | string | null | undefined): string {
  const data = paraData(valor);
  if (!data) return "—";
  return data.toLocaleDateString("pt-BR", {
    timeZone: FUSO_DO_PAINEL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "23/09 21:10" */
export function formatarDataHora(
  valor: Date | string | null | undefined,
): string {
  const data = paraData(valor);
  if (!data) return "—";
  const dia = data.toLocaleDateString("pt-BR", {
    timeZone: FUSO_DO_PAINEL,
    day: "2-digit",
    month: "2-digit",
  });
  return `${dia} ${formatarHora(data)}`;
}

export function formatarBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024,
    index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index++;
  }
  return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function formatarTempoAtivo(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60);
  return hours >= 24
    ? `${Math.floor(hours / 24)} d ${hours % 24} h`
    : hours
      ? `${hours} h ${minutes % 60} min`
      : `${minutes} min`;
}

/** Porcentagem inteira de `usado` sobre `total` (0 quando não há total). */
export function porcentagem(usado: number, total: number): number {
  if (!Number.isFinite(usado) || !Number.isFinite(total) || total <= 0)
    return 0;
  return Math.round((usado / total) * 100);
}
