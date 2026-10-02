import { sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { allowLocalDemo } from "@/lib/auth/deployment-security";
import { getSession, type AppSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { principalOperator } from "@/lib/workspace-policy";
import {
  sanitizeTrackAttribution,
  sanitizeTrackPage,
  sanitizeTrackReferrer,
} from "@/features/analytics/track-privacy";

import {
  evaluateDatabaseChecks,
  parseDatabaseSecurityMetadata,
  unknownDatabaseChecks,
} from "./checks";
import type { SecurityCheck, SecuritySnapshot } from "./model";

export class SecurityAccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "SecurityAccessError";
  }
}

export async function requireSecurityOperator(): Promise<AppSession> {
  let session: AppSession | null;
  try {
    session = await getSession();
  } catch {
    throw new SecurityAccessError(
      503,
      "Não foi possível verificar sua sessão. Tente novamente.",
    );
  }
  if (!session || session.demoMode)
    throw new SecurityAccessError(401, "Entre novamente para continuar.");
  if (!principalOperator(session.user, process.env))
    throw new SecurityAccessError(
      403,
      "Esta central está disponível apenas para o operador principal.",
    );
  return session;
}

/** Counts only metadata; never reads customers, policies' contents or secrets. */
export const SECURITY_METADATA_SQL = `
  WITH api_roles AS (
    SELECT oid, rolsuper, rolbypassrls
    FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  ), public_tables AS (
    SELECT c.oid, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ), dangerous_privileges AS (
    SELECT unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) AS privilege
  ), dangerous_table_grants AS (
    SELECT 1
    FROM public_tables t CROSS JOIN api_roles r CROSS JOIN dangerous_privileges p
    WHERE has_table_privilege(r.oid, t.oid, p.privilege)
    UNION ALL
    SELECT 1
    FROM public_tables t,
      LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
    WHERE a.grantee = 0
      AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ), dangerous_column_grants AS (
    SELECT 1
    FROM public_tables t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    CROSS JOIN api_roles r
    WHERE has_column_privilege(r.oid, t.oid, a.attnum, 'REFERENCES')
    UNION ALL
    SELECT 1
    FROM public_tables t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped,
      LATERAL aclexplode(a.attacl) rights
    WHERE rights.grantee = 0 AND rights.privilege_type = 'REFERENCES'
  ), future_table_grants AS (
    SELECT 1
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace,
      LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclobjtype = 'r'
      AND (d.defaclnamespace = 0 OR n.nspname = 'public')
      AND a.privilege_type IN (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      )
      AND (a.grantee = 0 OR EXISTS (
        SELECT 1 FROM api_roles r
        WHERE pg_has_role(r.oid, a.grantee, 'USAGE')
      ))
  ), exposed_definers AS (
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (EXISTS (
        SELECT 1 FROM api_roles r WHERE has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ) OR EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      ))
  )
  SELECT
    current_setting('server_version_num')::int AS "serverVersion",
    (SELECT count(*)::int FROM api_roles) AS "apiRoles",
    (SELECT count(*)::int FROM api_roles WHERE rolsuper OR rolbypassrls) AS "unsafeApiRoles",
    (SELECT count(*)::int FROM public_tables) AS "publicTables",
    (SELECT count(*)::int FROM public_tables WHERE NOT relrowsecurity) AS "tablesWithoutRls",
    (SELECT count(*)::int FROM public_tables t
      WHERE NOT t.relforcerowsecurity AND EXISTS (
        SELECT 1 FROM api_roles r WHERE pg_has_role(r.oid, t.relowner, 'USAGE')
      )
    ) AS "tablesWithApiOwnerBypass",
    (SELECT count(*)::int FROM dangerous_table_grants) AS "dangerousTableGrants",
    (SELECT count(*)::int FROM dangerous_column_grants) AS "dangerousColumnGrants",
    (SELECT count(*)::int FROM future_table_grants) AS "futureTableGrants",
    (SELECT count(*)::int FROM storage.buckets
      WHERE name IN ('dash', 'product-files', 'attachments', 'avatars') AND NOT public
    ) AS "privateBuckets",
    (SELECT count(*)::int FROM storage.buckets
      WHERE name = 'product-images' AND public
    ) AS "publicProductBuckets",
    (SELECT count(*)::int FROM storage.buckets
      WHERE public AND name <> 'product-images'
    ) AS "unexpectedPublicBuckets",
    (SELECT count(*)::int FROM exposed_definers) AS "exposedDefiners"
`;

function applicationChecks(checkedAt: string): SecurityCheck[] {
  const productionDemoBlocked = !allowLocalDemo({
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
  });
  const attribution = sanitizeTrackAttribution({
    utm_source: "security-canary",
    private_token: "must-not-persist",
  });
  const analyticsProtected =
    sanitizeTrackPage(
      "https://user:password@canary.invalid/page?token=must-not-persist#private",
    ) === "https://canary.invalid/page" &&
    sanitizeTrackReferrer(
      "https://user:password@canary.invalid/private?token=must-not-persist#private",
    ) === "https://canary.invalid" &&
    attribution.utm_source === "security-canary" &&
    !Object.hasOwn(attribution, "private_token");

  return [
    {
      id: "auth-production",
      title: "Autenticação real obrigatória",
      description:
        "O painel exige uma sessão real e bloqueia o modo demo em produção.",
      detail:
        "Sessão real do operador principal validada. Configuração de autenticação e bloqueio do fallback demo em produção verificados nesta execução.",
      status:
        isSupabaseConfigured() && productionDemoBlocked ? "active" : "warning",
      source: "live",
      category: "application",
      checkedAt,
    },
    {
      id: "analytics-privacy",
      title: "URLs sensíveis reduzidas no tracking",
      description:
        "As rotinas de tracking removem credenciais, query string e fragmentos privados.",
      detail:
        "Teste sintético executado nas rotinas atuais de sanitização. Confirma o código desta versão; não revisa dados históricos ou rastreadores externos.",
      status: analyticsProtected ? "active" : "warning",
      source: "live",
      category: "application",
      checkedAt,
    },
  ];
}

export async function getLiveSecuritySnapshot(): Promise<SecuritySnapshot> {
  await requireSecurityOperator();
  let databaseChecks = unknownDatabaseChecks();
  if (isDatabaseConfigured()) {
    try {
      const result = await getDb().transaction(
        async (tx) => {
          await tx.execute(sql`set local statement_timeout = '5000'`);
          return tx.execute(sql.raw(SECURITY_METADATA_SQL));
        },
        { accessMode: "read only", isolationLevel: "repeatable read" },
      );
      const metadata = parseDatabaseSecurityMetadata(result.rows[0]);
      if (metadata)
        databaseChecks = evaluateDatabaseChecks(
          metadata,
          new Date().toISOString(),
        );
    } catch {
      // Driver errors may contain credentials, SQL or private object names.
      databaseChecks = unknownDatabaseChecks();
    }
  }

  const checkedAt = new Date().toISOString();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  return {
    checkedAt,
    version: /^[a-f\d]{7,40}$/i.test(commit)
      ? commit.slice(0, 7)
      : "security-center-v1",
    checks: [...applicationChecks(checkedAt), ...databaseChecks],
  };
}
