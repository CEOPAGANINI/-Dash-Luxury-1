import type { SecurityCheck } from "./model";

export interface DatabaseSecurityMetadata {
  serverVersion: number;
  apiRoles: number;
  unsafeApiRoles: number;
  publicTables: number;
  tablesWithoutRls: number;
  tablesWithApiOwnerBypass: number;
  dangerousTableGrants: number;
  dangerousColumnGrants: number;
  futureTableGrants: number;
  privateBuckets: number;
  publicProductBuckets: number;
  unexpectedPublicBuckets: number;
  exposedDefiners: number;
}

const METADATA_KEYS = [
  "serverVersion",
  "apiRoles",
  "unsafeApiRoles",
  "publicTables",
  "tablesWithoutRls",
  "tablesWithApiOwnerBypass",
  "dangerousTableGrants",
  "dangerousColumnGrants",
  "futureTableGrants",
  "privateBuckets",
  "publicProductBuckets",
  "unexpectedPublicBuckets",
  "exposedDefiners",
] as const;

/** Reject missing/malformed fields rather than interpreting them as zero. */
export function parseDatabaseSecurityMetadata(
  value: unknown,
): DatabaseSecurityMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Partial<DatabaseSecurityMetadata> = {};
  for (const key of METADATA_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? Number(raw)
          : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
    result[key] = parsed;
  }
  return result as DatabaseSecurityMetadata;
}

const DATABASE_CHECKS = [
  {
    id: "database-rls",
    title: "Proteção das linhas do banco",
    description: "RLS habilitada em todas as tabelas do schema público.",
  },
  {
    id: "database-admin-grants",
    title: "Permissões administrativas restritas",
    description:
      "Clientes públicos não podem truncar tabelas, criar triggers ou obter permissões administrativas.",
  },
  {
    id: "database-future-grants",
    title: "Novas tabelas com acesso explícito",
    description:
      "Novas tabelas públicas não recebem acesso automático dos clientes da API.",
  },
  {
    id: "database-storage",
    title: "Arquivos privados protegidos",
    description:
      "Os quatro buckets privados continuam privados; imagens de produtos são públicas por escolha.",
  },
  {
    id: "database-definer",
    title: "Funções privilegiadas restritas",
    description:
      "Funções SECURITY DEFINER no schema público não estão disponíveis para os clientes da API.",
  },
] as const;

export function unknownDatabaseChecks(): SecurityCheck[] {
  return DATABASE_CHECKS.map((check) => ({
    ...check,
    status: "unknown",
    source: "live",
    category: "database",
    checkedAt: null,
    detail:
      "Não foi possível confirmar os metadados do banco. Nenhuma proteção foi marcada como ativa.",
  }));
}

export function evaluateDatabaseChecks(
  metadata: DatabaseSecurityMetadata,
  checkedAt: string,
): SecurityCheck[] {
  if (metadata.serverVersion < 170000 || metadata.apiRoles !== 2)
    return unknownDatabaseChecks();

  const statuses: Array<{ active: boolean; detail: string }> = [
    {
      active:
        metadata.publicTables > 0 &&
        metadata.tablesWithoutRls === 0 &&
        metadata.tablesWithApiOwnerBypass === 0 &&
        metadata.unsafeApiRoles === 0,
      detail: `${metadata.publicTables} tabelas verificadas; ${metadata.tablesWithoutRls} sem RLS; ${metadata.tablesWithApiOwnerBypass} com acesso do proprietário que ignora RLS; ${metadata.unsafeApiRoles} perfis da API podem ignorar RLS. Políticas de acesso específicas não são auditadas nesta consulta.`,
    },
    {
      active:
        metadata.dangerousTableGrants === 0 &&
        metadata.dangerousColumnGrants === 0 &&
        metadata.unsafeApiRoles === 0,
      detail: `${metadata.dangerousTableGrants} permissões administrativas efetivas em tabelas e ${metadata.dangerousColumnGrants} em colunas. A verificação inclui PUBLIC e privilégios herdados.`,
    },
    {
      active: metadata.futureTableGrants === 0,
      detail: `${metadata.futureTableGrants} permissões automáticas para novas tabelas, considerando todos os criadores e padrões do schema público e globais. Funções e sequências têm configurações próprias.`,
    },
    {
      active:
        metadata.privateBuckets === 4 &&
        metadata.publicProductBuckets === 1 &&
        metadata.unexpectedPublicBuckets === 0,
      detail: `${metadata.privateBuckets} de 4 buckets esperados privados; ${metadata.publicProductBuckets} bucket de imagens de produtos público; ${metadata.unexpectedPublicBuckets} buckets públicos não previstos. Políticas e URLs assinadas não são verificadas aqui.`,
    },
    {
      active: metadata.exposedDefiners === 0,
      detail: `${metadata.exposedDefiners} funções privilegiadas públicas executáveis pelos clientes da API. Schemas internos e código das funções não são auditados nesta consulta.`,
    },
  ];

  return DATABASE_CHECKS.map((check, index) => ({
    ...check,
    status: statuses[index].active ? "active" : "warning",
    source: "live",
    category: "database",
    checkedAt,
    detail: statuses[index].detail,
  }));
}

/** Evaluate actual response headers observed by the browser, not server intent. */
export function validateHeaderChecks(
  headers: Pick<Headers, "get">,
  checkedAt = new Date().toISOString(),
): SecurityCheck[] {
  const cache = (headers.get("cache-control") ?? "").toLowerCase();
  const robots = (headers.get("x-robots-tag") ?? "").toLowerCase();
  const frame = (headers.get("x-frame-options") ?? "").toLowerCase();
  const csp = headers.get("content-security-policy") ?? "";
  const referrer = (headers.get("referrer-policy") ?? "").toLowerCase();
  const checks = [
    {
      id: "headers-cache",
      title: "Dados privados fora do cache",
      description:
        "A resposta deste painel instrui caches a não guardar dados.",
      active:
        /(?:^|,)\s*private\s*(?:,|$)/.test(cache) &&
        /(?:^|,)\s*no-store\s*(?:,|$)/.test(cache) &&
        !/(?:^|,)\s*public\s*(?:,|$)/.test(cache) &&
        !/(?:^|,)\s*s-maxage\s*=/.test(cache),
    },
    {
      id: "headers-robots",
      title: "Painel fora dos buscadores",
      description:
        "Cabeçalhos da resposta solicitam que este painel não seja indexado.",
      active: ["noindex", "nofollow", "noarchive"].every((token) =>
        robots.split(/[,\s]+/).includes(token),
      ),
    },
    {
      id: "headers-frame",
      title: "Proteção contra incorporação",
      description:
        "A resposta impede a abertura do painel dentro de outros sites.",
      active:
        frame.trim() === "deny" &&
        csp
          .split(";")
          .some((directive) =>
            /^\s*frame-ancestors\s+'none'\s*$/i.test(directive),
          ),
    },
    {
      id: "headers-referrer",
      title: "Endereço privado sem referência",
      description: "A resposta evita enviar o endereço privado como Referer.",
      active: referrer.trim() === "no-referrer",
    },
    {
      id: "headers-powered-by",
      title: "Identificação técnica reduzida",
      description: "A resposta não apresenta o cabeçalho X-Powered-By.",
      active: headers.get("x-powered-by") === null,
    },
  ];

  return checks.map(({ active, ...check }) => ({
    ...check,
    status: active ? "active" : "warning",
    source: "live",
    category: "application",
    checkedAt,
    detail: active
      ? "Confirmado nos cabeçalhos da resposta recebida agora."
      : "A resposta recebida não atende aos requisitos deste controle.",
  }));
}

/** SSR cannot observe the browser's final response headers. */
export function unknownHeaderChecks(): SecurityCheck[] {
  return validateHeaderChecks(new Headers()).map((check) => ({
    ...check,
    status: "unknown",
    checkedAt: null,
    detail: "Aguardando os cabeçalhos da resposta recebida pelo navegador.",
  }));
}
