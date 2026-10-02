"use client";

import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Eye,
  GitBranch,
  Globe2,
  History,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { validateHeaderChecks } from "./checks";
import { isLiveCheckFresh } from "./model";
import type { SecurityCheck, SecuritySnapshot } from "./model";
import styles from "./security-dashboard.module.css";

const POLL_MS = 60_000;
const AUDIT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

const CATEGORIES = [
  {
    id: "application",
    title: "Dashboard",
    subtitle: "Acesso e navegação",
    icon: LockKeyhole,
  },
  {
    id: "database",
    title: "Supabase",
    subtitle: "Banco e permissões",
    icon: Database,
  },
  {
    id: "github",
    title: "GitHub",
    subtitle: "Código e conta",
    icon: GitBranch,
  },
  {
    id: "vercel",
    title: "Vercel",
    subtitle: "Publicação e conta",
    icon: Globe2,
  },
  {
    id: "infrastructure",
    title: "Infraestrutura",
    subtitle: "Domínios e hospedagem",
    icon: Server,
  },
] as const;

const STATUS_LABEL: Record<SecurityCheck["status"], string> = {
  active: "Ativa",
  warning: "Atenção",
  pending: "Pendente",
  unknown: "Sem confirmação",
};

type Filter = "all" | "attention" | "live" | "audit";
type Change = {
  id: string;
  title: string;
  before: SecurityCheck["status"];
  after: SecurityCheck["status"];
  checkedAt: string;
  detailChanged: boolean;
};

function formatTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return "Ainda não verificado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return "Sem data de revisão";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

/** Only accept the small public status contract; never display an error body. */
function isSnapshot(value: unknown): value is SecuritySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SecuritySnapshot>;
  if (
    typeof snapshot.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.checkedAt)) ||
    typeof snapshot.version !== "string" ||
    !Array.isArray(snapshot.checks) ||
    snapshot.checks.length > 100
  )
    return false;
  return snapshot.checks.every(
    (check) =>
      check &&
      typeof check.id === "string" &&
      typeof check.title === "string" &&
      typeof check.description === "string" &&
      typeof check.detail === "string" &&
      ["active", "warning", "pending", "unknown"].includes(check.status) &&
      ["live", "audit", "planned"].includes(check.source) &&
      CATEGORIES.some((category) => category.id === check.category) &&
      (check.checkedAt === null || typeof check.checkedAt === "string"),
  );
}

function unavailableChecks(snapshot: SecuritySnapshot): SecuritySnapshot {
  return {
    ...snapshot,
    checks: snapshot.checks.map((check) =>
      check.source === "live"
        ? {
            ...check,
            status: "unknown",
            detail:
              "A verificação não foi concluída. O estado anterior não confirma a proteção neste momento.",
          }
        : check,
    ),
  };
}

function displayCheck(
  check: SecurityCheck,
  now: number,
  paused: boolean,
): SecurityCheck {
  if (check.source === "audit" && check.status === "active") {
    const auditedAt = check.checkedAt ? Date.parse(check.checkedAt) : NaN;
    if (!Number.isFinite(auditedAt) || now - auditedAt > AUDIT_MAX_AGE_MS) {
      return {
        ...check,
        status: "warning",
        detail: `${check.detail} A revisão manual venceu. Confira esta configuração na conta do serviço.`,
      };
    }
  }
  if (check.source === "live" && check.status === "active") {
    if (paused || !isLiveCheckFresh(check, now)) {
      return {
        ...check,
        status: "unknown",
        detail: paused
          ? "A verificação automática está pausada. Retome para confirmar o estado atual."
          : "A última confirmação ficou antiga. Verifique novamente para confirmar o estado atual.",
      };
    }
  }
  return check;
}

function meaningfulChanges(
  previous: SecuritySnapshot,
  next: SecuritySnapshot,
): Change[] {
  const before = new Map(previous.checks.map((check) => [check.id, check]));
  return next.checks.flatMap((check) => {
    const old = before.get(check.id);
    // The first confirmation establishes a baseline; it is not a setting change.
    if (old?.status === "unknown" && old.checkedAt === null) return [];
    if (!old || (old.status === check.status && old.detail === check.detail))
      return [];
    return [
      {
        id: `${check.id}:${next.checkedAt}`,
        title: check.title,
        before: old.status,
        after: check.status,
        checkedAt: next.checkedAt,
        detailChanged: old.status === check.status,
      },
    ];
  });
}

function safeActionHref(value: string | undefined) {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

function CheckCard({ check, now }: { check: SecurityCheck; now: number }) {
  const href = safeActionHref(check.actionHref);
  const auditExpired =
    check.source === "audit" &&
    check.checkedAt !== null &&
    now - Date.parse(check.checkedAt) > AUDIT_MAX_AGE_MS;
  return (
    <article
      className={styles.checkCard}
      data-status={check.status}
      data-check-id={check.id}
    >
      <div className={styles.checkTop}>
        <span className={styles.checkSource}>
          {check.source === "live" ? (
            <Activity />
          ) : check.source === "audit" ? (
            <Clock3 />
          ) : (
            <Server />
          )}
          {check.source === "live"
            ? "Verificação automática"
            : check.source === "audit"
              ? "Revisão manual"
              : "Ainda não configurada"}
        </span>
        <span className={styles.status} data-status={check.status}>
          <span
            className={styles.led}
            data-pulse={check.source === "live" && check.status === "active"}
            aria-hidden="true"
          />
          {STATUS_LABEL[check.status]}
        </span>
      </div>
      <h3>{check.title}</h3>
      <p className={styles.description}>{check.description}</p>
      <div className={styles.cardFooter}>
        <span className={styles.checkedAt}>
          {check.source === "audit"
            ? `${auditExpired ? "Revisão vencida" : "Revisada"} · ${formatDate(check.checkedAt)}`
            : check.source === "live"
              ? `Última leitura · ${formatTime(check.checkedAt)}`
              : "Depende de configuração"}
        </span>
        <details className={styles.details}>
          <summary>
            Detalhes <ChevronDown aria-hidden="true" />
          </summary>
          <p>{check.detail}</p>
          {href && (
            <a
              href={href}
              target={href.startsWith("https:") ? "_blank" : undefined}
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {check.actionLabel || "Abrir configuração"}{" "}
              <ArrowUpRight aria-hidden="true" />
            </a>
          )}
        </details>
      </div>
    </article>
  );
}

export function SecurityDashboard({
  initialSnapshot,
}: {
  initialSnapshot: SecuritySnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<Change[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.parse(initialSnapshot.checkedAt));
  const latest = useRef(initialSnapshot);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const pausedRef = useRef(false);

  const commitSnapshot = useCallback((next: SecuritySnapshot) => {
    const changes = meaningfulChanges(latest.current, next);
    latest.current = next;
    setSnapshot(next);
    setNow(Date.now());
    if (changes.length) {
      setHistory((current) => [...changes, ...current].slice(0, 10));
      setAnnouncement(
        `${changes.length} ${changes.length === 1 ? "configuração mudou" : "configurações mudaram"}. Confira as alterações abaixo.`,
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    if (request.current || document.visibilityState === "hidden") return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    try {
      const response = await fetch("/api/painel/seguranca", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unavailable");
      const value: unknown = await response.json();
      if (!isSnapshot(value)) throw new Error("Unavailable");
      const checkedAt = new Date().toISOString();
      const headerChecks = validateHeaderChecks(response.headers, checkedAt);
      const headersById = new Map(
        headerChecks.map((check) => [check.id, check]),
      );
      const merged = new Map(value.checks.map((check) => [check.id, check]));
      headersById.forEach((check, id) => merged.set(id, check));
      if (!mounted.current || controller.signal.aborted) return;
      commitSnapshot({ ...value, checkedAt, checks: [...merged.values()] });
      setFailed(false);
    } catch {
      if (!mounted.current || (controller.signal.aborted && !timedOut)) return;
      const next = unavailableChecks(latest.current);
      next.checkedAt = new Date().toISOString();
      commitSnapshot(next);
      setFailed(true);
      setAnnouncement(
        "A verificação falhou. As proteções automáticas estão sem confirmação.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }, [commitSnapshot]);

  useEffect(() => {
    mounted.current = true;
    const syncVisibility = () => {
      const isVisible = document.visibilityState !== "hidden";
      setVisible(isVisible);
      setNow(Date.now());
      if (isVisible && !pausedRef.current) void refresh();
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        setNow(Date.now());
        if (!pausedRef.current) void refresh();
      }
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncVisibility);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    setNow(Date.now());
    if (!next) void refresh();
  };

  const checks = useMemo(
    () =>
      snapshot.checks.map((check) =>
        displayCheck(check, now, paused || !visible),
      ),
    [snapshot.checks, now, paused, visible],
  );
  const automatic = checks.filter(
    (check) => check.source === "live" && check.status === "active",
  ).length;
  const audited = checks.filter(
    (check) => check.source === "audit" && check.status === "active",
  ).length;
  const attention = checks.filter((check) => check.status !== "active").length;
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = checks.filter((check) => {
    const matches =
      filter === "all" ||
      (filter === "attention" && check.status !== "active") ||
      check.source === filter;
    return (
      matches &&
      (!query ||
        `${check.title} ${check.description}`
          .toLocaleLowerCase("pt-BR")
          .includes(query))
    );
  });
  const pending2FA = checks.filter(
    (check) =>
      /2fa|dois fatores|duas etapas/i.test(`${check.id} ${check.title}`) &&
      check.status !== "active",
  );

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>
          <ShieldCheck aria-hidden="true" /> CENTRAL DE PROTEÇÃO{" "}
          <span>/ CONFIGURAÇÕES</span>
        </div>
        <div className={styles.heroRow}>
          <div>
            <h2>
              Segurança e privacidade<span>.</span>
            </h2>
            <p>
              Veja o que está protegido, o que precisa da sua atenção e quando
              cada configuração foi conferida.
            </p>
          </div>
          <div
            className={styles.monitorBadge}
            data-running={!paused && visible && !failed}
          >
            <span
              className={styles.led}
              data-pulse={!paused && visible && !failed}
              aria-hidden="true"
            />
            <div>
              <strong>
                {failed
                  ? "Verificação indisponível"
                  : paused
                    ? "Monitor pausado"
                    : !visible
                      ? "Aba em segundo plano"
                      : "Monitor em execução"}
              </strong>
              <small>A cada 60 segundos, com esta página aberta</small>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <Activity aria-hidden="true" />
          <span>Confirmadas agora</span>
          <strong>{automatic.toString().padStart(2, "0")}</strong>
          <small>Verificação automática</small>
        </div>
        <div className={styles.summaryItem}>
          <Check aria-hidden="true" />
          <span>Revisadas manualmente</span>
          <strong>{audited.toString().padStart(2, "0")}</strong>
          <small>Com data de conferência</small>
        </div>
        <div className={styles.summaryItem} data-attention={attention > 0}>
          <ShieldAlert aria-hidden="true" />
          <span>Precisam de atenção</span>
          <strong>{attention.toString().padStart(2, "0")}</strong>
          <small>Inclui pendentes e sem confirmação</small>
        </div>
        <div className={styles.summaryItem}>
          <Clock3 aria-hidden="true" />
          <span>Última tentativa</span>
          <strong className={styles.timeValue}>
            {formatTime(snapshot.checkedAt)}
          </strong>
          <small>{formatDate(snapshot.checkedAt)} · horário de Brasília</small>
        </div>
      </div>

      {pending2FA.length > 0 && (
        <div className={styles.notice}>
          <ShieldAlert aria-hidden="true" />
          <div>
            <strong>A autenticação em duas etapas continua pendente</strong>
            <p>
              Você deixou esta etapa para depois. Conclua nas contas indicadas
              abaixo e faça uma nova revisão manual.
            </p>
          </div>
          <button type="button" onClick={() => setFilter("attention")}>
            Ver pendências <ArrowUpRight aria-hidden="true" />
          </button>
        </div>
      )}

      {failed && (
        <div className={styles.failure} role="alert">
          <WifiOff aria-hidden="true" />
          <div>
            <strong>Não foi possível confirmar o estado atual.</strong>
            <p>
              Os indicadores automáticos ficaram sem confirmação. Tente
              novamente; nenhuma configuração foi alterada.
            </p>
          </div>
        </div>
      )}

      <section className={styles.controls} aria-label="Controles do monitor">
        <div className={styles.filters}>
          {(
            [
              ["all", "Todas"],
              ["attention", "Atenção"],
              ["live", "Automáticas"],
              ["audit", "Revisão manual"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
            >
              {label}
              {id === "attention" && <span>{attention}</span>}
            </button>
          ))}
        </div>
        <div className={styles.monitorControls}>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar proteção"
              aria-label="Buscar proteção"
            />
          </label>
          <button
            className={styles.iconButton}
            type="button"
            onClick={togglePause}
            aria-label={
              paused
                ? "Retomar verificação automática"
                : "Pausar verificação automática"
            }
            title={paused ? "Retomar" : "Pausar"}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </button>
          <button
            className={styles.refreshButton}
            type="button"
            onClick={() => void refresh()}
            disabled={busy || paused}
          >
            <RefreshCw
              className={busy ? styles.spinning : undefined}
              aria-hidden="true"
            />
            {busy ? "Verificando" : "Verificar agora"}
          </button>
        </div>
      </section>

      <div className={styles.legend}>
        <span>
          <span className={styles.led} data-pulse aria-hidden="true" /> Verde
          pulsando: confirmação automática recente
        </span>
        <span>
          <span className={styles.staticDot} aria-hidden="true" /> Verde fixo:
          revisão manual datada
        </span>
        <span>Revisões manuais vencem em 7 dias</span>
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </div>

      <div className={styles.groups}>
        {CATEGORIES.map((category) => {
          const group = filtered.filter(
            (check) => check.category === category.id,
          );
          if (!group.length) return null;
          const Icon = category.icon;
          return (
            <section
              key={category.id}
              className={styles.group}
              aria-labelledby={`security-${category.id}`}
            >
              <div className={styles.groupHeader}>
                <span className={styles.groupIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h2 id={`security-${category.id}`}>{category.title}</h2>
                  <p>{category.subtitle}</p>
                </div>
                <span className={styles.groupCount}>
                  {group.length.toString().padStart(2, "0")}
                </span>
              </div>
              <div className={styles.cards}>
                {group.map((check) => (
                  <CheckCard key={check.id} check={check} now={now} />
                ))}
              </div>
            </section>
          );
        })}
        {!filtered.length && (
          <div className={styles.empty}>
            <Search aria-hidden="true" />
            <h2>Nenhuma configuração neste filtro</h2>
            <p>Troque o filtro ou busque por outro nome.</p>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setSearch("");
              }}
            >
              Mostrar todas
            </button>
          </div>
        )}
      </div>

      <div className={styles.bottomGrid}>
        <section
          className={styles.boundaries}
          aria-labelledby="security-boundaries"
        >
          <div className={styles.sectionHeading}>
            <Eye aria-hidden="true" />
            <div>
              <h2 id="security-boundaries">
                O que fica público e o que protegemos
              </h2>
              <p>Privacidade da operação, com limites claros.</p>
            </div>
          </div>
          <div className={styles.boundaryColumns}>
            <div>
              <span className={styles.boundaryLabel}>PÚBLICO</span>
              <h3>Domínio, páginas e anúncios</h3>
              <p>
                São visíveis aos visitantes. DNS, certificados e as páginas
                acessadas podem revelar informações públicas sobre a
                infraestrutura.
              </p>
            </div>
            <div>
              <span className={styles.boundaryLabel}>ACESSO RESTRITO</span>
              <h3>Painel, regras e dados</h3>
              <p>
                O painel exige login. Regras e permissões são conferidas no
                servidor e no banco. Chaves e dados pessoais não aparecem nesta
                central.
              </p>
            </div>
          </div>
          <p className={styles.scopeNote}>
            <Server aria-hidden="true" /> O serviço PHP permanece local.
            Cloudflare e hospedagem externa ainda precisam ser configurados.
            Estas proteções não tornam a operação invisível.
          </p>
        </section>
        <section className={styles.history} aria-labelledby="security-history">
          <div className={styles.sectionHeading}>
            <History aria-hidden="true" />
            <div>
              <h2 id="security-history">Mudanças observadas</h2>
              <p>Últimas 10 alterações nesta sessão.</p>
            </div>
          </div>
          {history.length ? (
            <ol>
              {history.map((change, index) => (
                <li key={`${change.id}:${index}`}>
                  <span
                    className={styles.historyDot}
                    data-status={change.after}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{change.title}</strong>
                    <p>
                      {change.detailChanged
                        ? "Detalhes da verificação foram atualizados"
                        : `${STATUS_LABEL[change.before]} → ${STATUS_LABEL[change.after]}`}
                    </p>
                    <time dateTime={change.checkedAt}>
                      {formatTime(change.checkedAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.historyEmpty}>
              <Check aria-hidden="true" />
              <strong>Nenhuma mudança observada</strong>
              <p>
                O histórico começa quando esta página abre. As datas das
                verificações, sozinhas, não geram alertas.
              </p>
            </div>
          )}
          <p className={styles.historyNote}>
            O monitor acompanha esta página aberta. Configurações de conta
            marcadas como revisão manual precisam ser conferidas no próprio
            serviço.
          </p>
        </section>
      </div>
      <footer className={styles.pageFooter}>
        <span>
          Central de proteção <span aria-hidden="true">/</span>{" "}
          {snapshot.version}
        </span>
        <span>Somente leitura · nenhuma alteração é feita pelo monitor</span>
      </footer>
    </div>
  );
}
