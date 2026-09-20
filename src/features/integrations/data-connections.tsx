"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Plug, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CONNECTION_META,
  useDataConnections,
  type ConnectionId,
  type ConnectionMeta,
  type StoredConnection,
} from "@/lib/data-connections";
import { FIELDS, validateFields } from "./connection-fields";
import {
  removeConnectionAction,
  saveConnectionAction,
  useGoogleForYoutubeAction,
  type ResultadoConexao,
} from "./connections-actions";

/**
 * Conectar fontes de dados.
 *
 * Uma placa por fonte: Meta, Google, YouTube, gateway e Shopify. Meta e
 * Google têm dois caminhos: o botão "Conectar com…" (a pessoa autoriza na
 * própria plataforma e o token chega sozinho) e o formulário, para quem
 * prefere colar as credenciais. Nos dois, o segredo vai criptografado para
 * o banco e a tela só vê a máscara (ver connections-store.ts).
 *
 * O checklist da área Dados lê o mesmo estado: configurou aqui, o placar de
 * lá muda na hora.
 */

export interface OauthDisponivel {
  meta: boolean;
  google: boolean;
}

export interface AvisoOauth {
  provider: "meta" | "google";
  resultado: "ok" | "cancelado" | "state" | "erro";
}

const MENSAGEM_OAUTH: Record<AvisoOauth["resultado"], string> = {
  ok: "conectado. O token chegou pela autorização e ficou criptografado.",
  cancelado: "não foi conectado — a autorização foi cancelada na plataforma.",
  state:
    "não foi conectado — a autorização expirou ou veio de outra aba. Clique em Conectar de novo.",
  erro: "não foi conectado — a plataforma recusou a troca do código. Confira o app e a URI de redirecionamento cadastrada nele.",
};

const INPUT_CLASS =
  "border-input mt-1 h-10 w-full rounded-lg border bg-transparent px-3 text-sm font-medium focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

const BOTAO_PRIMARIO =
  "bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50";
const BOTAO_CONTORNO =
  "border-input hover:bg-muted/30 focus-visible:ring-ring flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold focus-visible:ring-2 focus-visible:outline-none";

export function DataConnections({
  oauth,
  bancoConfigurado,
  aviso,
}: {
  oauth: OauthDisponivel;
  bancoConfigurado: boolean;
  aviso?: AvisoOauth;
}) {
  const { connections } = useDataConnections();
  const [open, setOpen] = React.useState<ConnectionId | null>(null);

  /* O checklist manda para cá com #conexao-<fonte>: a placa certa já abre e
     desce até ficar na tela. A abertura é agendada, e não síncrona, para o
     efeito não disparar um render em cascata na hidratação. */
  React.useEffect(() => {
    const match = window.location.hash.match(/^#conexao-(\w+)$/);
    if (!match) return;
    const id = CONNECTION_META.find((item) => item.id === match[1])?.id;
    if (!id) return;
    const timeout = window.setTimeout(() => {
      setOpen(id);
      document
        .getElementById(`conexao-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, []);

  const total = CONNECTION_META.length;
  const done = CONNECTION_META.filter((item) => connections[item.id]).length;

  return (
    <section
      aria-labelledby="conectar-fontes-titulo"
      className="@container bg-card flex min-w-0 flex-col overflow-hidden rounded-2xl border"
    >
      <header className="flex items-start gap-2.5 border-b px-4 py-3">
        <span
          aria-hidden
          className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border"
        >
          <Plug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
            Fontes de dados
          </span>
          <h2
            id="conectar-fontes-titulo"
            className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight"
          >
            Conectar fontes
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs leading-5">
            Meta e Google conectam com um clique, autorizando na própria
            plataforma. As outras pedem as credenciais que a plataforma
            emite. Todo segredo vai criptografado para o banco.
          </p>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs leading-4 font-bold tabular-nums">
          {done} de {total}
          <span className="font-medium"> configuradas</span>
        </span>
      </header>

      <span aria-hidden className="bg-muted/60 flex h-0.5 overflow-hidden">
        <span
          className="bg-success"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>

      {aviso && (
        <p
          role="status"
          className={cn(
            "border-b px-4 py-2 text-xs leading-5",
            aviso.resultado === "ok"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning",
          )}
        >
          <b>{aviso.provider === "meta" ? "Meta Ads" : "Google Ads"}</b>{" "}
          {MENSAGEM_OAUTH[aviso.resultado]}
        </p>
      )}

      {!bancoConfigurado && (
        <p className="bg-warning/10 text-warning border-b px-4 py-2 text-xs leading-5">
          Sem banco de dados, nenhuma conexão fica salva. Configure o Supabase
          na Vercel (DATABASE_URL e ENCRYPTION_KEY) para as conexões
          existirem de verdade.
        </p>
      )}

      <div className="divide-border/60 divide-y">
        {CONNECTION_META.map((meta) => (
          <ProviderCard
            key={meta.id}
            meta={meta}
            stored={connections[meta.id]}
            googleIdentifier={connections.google?.identifier}
            oauthDisponivel={
              meta.id === "meta" || meta.id === "google" ? oauth[meta.id] : false
            }
            open={open === meta.id}
            onToggle={() =>
              setOpen((current) => (current === meta.id ? null : meta.id))
            }
            onOpenGoogle={() => setOpen("google")}
          />
        ))}
      </div>
    </section>
  );
}

function ProviderCard({
  meta,
  stored,
  googleIdentifier,
  oauthDisponivel,
  open,
  onToggle,
  onOpenGoogle,
}: {
  meta: ConnectionMeta;
  stored?: StoredConnection;
  googleIdentifier?: string;
  oauthDisponivel: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenGoogle: () => void;
}) {
  const isConfigured = Boolean(stored);

  return (
    <article id={`conexao-${meta.id}`} className="scroll-mt-24">
      {/* A linha inteira abre e fecha a placa — alvo grande, sem caça ao
          botão. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-muted/20 focus-visible:ring-ring flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <i
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{
            backgroundColor: meta.color,
            boxShadow: `0 0 7px ${meta.color}`,
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <b className="text-sm leading-5 font-extrabold">{meta.name}</b>
            <span className="text-muted-foreground text-[0.6875rem] leading-4">
              {meta.category}
            </span>
          </span>
          <span className="text-muted-foreground block truncate text-xs leading-5">
            {stored
              ? `${stored.identifier} · token ${stored.tokenMask}${stored.via === "oauth" ? " · autorizado na plataforma" : ""}`
              : meta.unlocks}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 text-[0.6875rem] leading-4 font-bold whitespace-nowrap",
            isConfigured
              ? "border-success/40 text-success bg-success/10"
              : "border-warning/40 text-warning bg-warning/10",
          )}
        >
          {isConfigured ? "Conectada" : "Não conectada"}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-border/60 border-t px-4 py-3">
          {meta.id === "youtube" ? (
            <YoutubeBody
              stored={stored}
              googleIdentifier={googleIdentifier}
              onOpenGoogle={onOpenGoogle}
            />
          ) : stored ? (
            <ConnectedBody meta={meta} stored={stored} />
          ) : (
            <div className="space-y-4">
              {(meta.id === "meta" || meta.id === "google") && (
                <OauthButton provider={meta.id} disponivel={oauthDisponivel} />
              )}
              <ProviderForm meta={meta} comOauth={meta.id === "meta" || meta.id === "google"} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * O caminho de um clique. O botão leva para a rota que começa o OAuth; a
 * plataforma pede autorização e devolve a pessoa aqui com o token já
 * guardado. Sem as chaves do app na Vercel, o botão diz o que falta em vez
 * de levar para um erro.
 */
function OauthButton({
  provider,
  disponivel,
}: {
  provider: "meta" | "google";
  disponivel: boolean;
}) {
  const nome = provider === "meta" ? "Meta" : "Google";
  const variaveis =
    provider === "meta"
      ? "META_APP_ID e META_APP_SECRET"
      : "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET";
  const onde =
    provider === "meta"
      ? "developers.facebook.com → seu app → Configurações → Básico"
      : "console.cloud.google.com → APIs e serviços → Credenciais";

  return (
    <div className="bg-muted/30 rounded-lg border px-3 py-3">
      <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
        Caminho rápido
      </span>
      <span className="text-muted-foreground block text-[0.6875rem] leading-4">
        Autorize na própria plataforma; o token chega sozinho e fica
        criptografado. Nenhuma senha passa por aqui.
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {disponivel ? (
          <a href={`/api/oauth/${provider}/start`} className={BOTAO_PRIMARIO}>
            <ExternalLink aria-hidden className="size-3.5" />
            Conectar com {nome}
          </a>
        ) : (
          <>
            <button type="button" disabled className={BOTAO_PRIMARIO}>
              <ExternalLink aria-hidden className="size-3.5" />
              Conectar com {nome}
            </button>
            <span className="text-warning text-[0.6875rem] leading-4">
              Faltam {variaveis} na Vercel ({onde}). Com elas, este botão liga.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ConnectedBody({
  meta,
  stored,
}: {
  meta: ConnectionMeta;
  stored: StoredConnection;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs leading-5">
        {stored.identifier} · token {stored.tokenMask}
        {stored.via === "oauth"
          ? " · autorizado na plataforma"
          : " · digitado"}
        . Para trocar de conta ou de token, desconecte e conecte de novo.
      </p>
      <DisconnectButton id={meta.id} name={meta.name} />
    </div>
  );
}

/**
 * YouTube não tem credencial própria: as campanhas de vídeo moram na mesma
 * conta do Google Ads. Conectar é declarar que aquela conta também alimenta
 * os painéis de vídeo.
 */
function YoutubeBody({
  stored,
  googleIdentifier,
  onOpenGoogle,
}: {
  stored?: StoredConnection;
  googleIdentifier?: string;
  onOpenGoogle: () => void;
}) {
  const [estado, acao, pendente] = useActionState<ResultadoConexao | null>(
    useGoogleForYoutubeAction,
    null,
  );

  if (stored) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs leading-5">
          Usando a conexão do Google Ads ({stored.identifier}). As campanhas de
          vídeo entram pela mesma conta.
        </p>
        <DisconnectButton id="youtube" name="YouTube Ads" />
      </div>
    );
  }

  if (!googleIdentifier) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs leading-5">
          O YouTube usa a mesma conta do Google Ads — conecte o Google
          primeiro e volte aqui.
        </p>
        <button type="button" onClick={onOpenGoogle} className={BOTAO_CONTORNO}>
          Abrir a conexão do Google Ads
        </button>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-2">
      <p className="text-muted-foreground text-xs leading-5">
        A conta {googleIdentifier} do Google Ads já está conectada. Basta
        confirmar que ela também alimenta os painéis de vídeo.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          <Check aria-hidden className="size-3.5" />
          {pendente ? "Ligando…" : "Usar a conexão do Google Ads"}
        </button>
        {estado && !estado.ok && (
          <span role="status" className="text-warning text-xs font-semibold">
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}

function ProviderForm({
  meta,
  comOauth,
}: {
  meta: ConnectionMeta;
  comOauth: boolean;
}) {
  const fields = FIELDS[meta.id] ?? [];
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errosLocais, setErrosLocais] = React.useState<Record<string, string>>({});
  const [estado, acao, pendente] = useActionState<
    ResultadoConexao | null,
    FormData
  >(saveConnectionAction, null);

  /* O navegador valida primeiro para a pessoa não esperar a ida ao
     servidor por um traço faltando; o servidor valida de novo de qualquer
     jeito. */
  function aoEnviar(event: React.FormEvent<HTMLFormElement>) {
    const erros = validateFields(meta.id, values);
    setErrosLocais(erros);
    if (Object.keys(erros).length > 0) event.preventDefault();
  }

  const erros = { ...(estado?.erros ?? {}), ...errosLocais };

  return (
    <form action={acao} onSubmit={aoEnviar} className="space-y-3">
      <input type="hidden" name="id" value={meta.id} />

      {comOauth && (
        <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
          Ou cole as credenciais
        </span>
      )}

      {meta.id === "gateway" && <WebhookAddress />}

      {fields.map((field) => (
        <label key={field.name} className="block">
          <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
            {field.label}
          </span>
          <span className="text-muted-foreground block text-[0.6875rem] leading-4">
            {field.hint}
          </span>
          <input
            type={field.secret ? "password" : "text"}
            name={field.name}
            autoComplete="off"
            spellCheck={false}
            value={values[field.name] ?? ""}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.name]: event.target.value,
              }))
            }
            placeholder={field.placeholder}
            aria-invalid={Boolean(erros[field.name])}
            className={cn(INPUT_CLASS, erros[field.name] && "border-destructive")}
          />
          {erros[field.name] && (
            <span className="text-destructive mt-1 block text-xs leading-4 font-semibold">
              {erros[field.name]}
            </span>
          )}
        </label>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          <Check aria-hidden className="size-3.5" />
          {pendente ? "Salvando…" : "Salvar conexão"}
        </button>
        {estado && !estado.ok ? (
          <span role="status" className="text-warning text-[0.6875rem] leading-4 font-semibold">
            {estado.mensagem}
          </span>
        ) : (
          <span className="text-muted-foreground text-[0.6875rem] leading-4">
            O segredo vai criptografado para o banco e não volta para a tela.
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * O endereço que o gateway chama a cada pagamento. Já existe e responde
 * (src/app/api/webhooks/gateway/route.ts); o processamento entra junto com
 * a sincronização de servidor.
 */
function WebhookAddress() {
  const [url, setUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  /* O endereço só existe no navegador (window.location); agendado para não
     ser um setState síncrono dentro do efeito. */
  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setUrl(`${window.location.origin}/api/webhooks/gateway`);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  React.useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  if (!url) return null;

  return (
    <div className="bg-muted/30 rounded-lg border px-3 py-2">
      <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
        Endereço do webhook
      </span>
      <span className="text-muted-foreground block text-[0.6875rem] leading-4">
        Cadastre este endereço no painel do gateway, no evento de pagamento
        atualizado.
      </span>
      <span className="mt-1.5 flex items-center gap-2">
        <code className="text-foreground min-w-0 flex-1 truncate font-mono text-xs">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url);
            setCopied(true);
          }}
          className="border-input hover:bg-muted/30 focus-visible:ring-ring flex min-h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[0.6875rem] font-bold focus-visible:ring-2 focus-visible:outline-none"
        >
          <Copy aria-hidden className="size-3" />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </span>
    </div>
  );
}

function DisconnectButton({ id, name }: { id: ConnectionId; name: string }) {
  return (
    <form action={removeConnectionAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 focus-visible:ring-ring flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold focus-visible:ring-2 focus-visible:outline-none"
      >
        <X aria-hidden className="size-3.5" />
        Desconectar {name}
      </button>
    </form>
  );
}
