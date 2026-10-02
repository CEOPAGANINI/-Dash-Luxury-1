"use client";

import * as React from "react";
import type { SiteDTO } from "@/features/vps/modelo";
import {
  enviarZip,
  lerEstado,
  type EstadoDaTela,
} from "@/features/vps/vps-cliente";
import type { PreparedPageZip } from "./page-zip";
import { FlowStatusBadge } from "./flow-ui";

type Props = {
  zip: PreparedPageZip | null;
  domain?: string;
  path: string;
  onDomainChange: (domain: string) => void;
};

type PublicationScope = {
  siteId: string;
  domain: string;
  path: string;
  file: File | null;
};

type PublicationReceipt = PublicationScope & {
  siteName: string;
  releaseId: string;
  confirmed: boolean;
};

function samePublication(a: PublicationScope, b: PublicationScope) {
  return (
    a.siteId === b.siteId &&
    a.domain === b.domain &&
    a.path === b.path &&
    a.file === b.file
  );
}

/** The API publishes a WHOLE site version. Never silently treat it as a path upload. */
export function PageVpsPublisher({ zip, domain, path, onDomainChange }: Props) {
  const [state, setState] = React.useState<EstadoDaTela | null>(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [operation, setOperation] = React.useState<{
    kind: "loading" | "publishing" | "checking";
    scope: PublicationScope;
  } | null>(null);
  const [feedback, setFeedback] = React.useState<{
    scope: PublicationScope;
    error?: string;
    message?: string;
  } | null>(null);
  const [confirmation, setConfirmation] = React.useState<{
    site: SiteDTO;
    file: File;
    domain: string;
  } | null>(null);
  const [receipt, setReceipt] = React.useState<PublicationReceipt | null>(null);
  const mounted = React.useRef(false);
  const locked = React.useRef(false);
  const cancel = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useEffect(() => {
    if (confirmation) cancel.current?.focus();
  }, [confirmation]);

  const selected = state?.sites.find((site) => site.id === selectedId);
  const domainMatches = Boolean(
    selected?.dominios.some((item) => item.hostname === domain),
  );
  const isRoot = path.trim() === "/";
  const canPublish = Boolean(
    zip &&
    selected &&
    selected.estado !== "removendo" &&
    state?.podeAlterar &&
    isRoot &&
    domainMatches,
  );
  const scope: PublicationScope = {
    siteId: selectedId,
    domain: domain ?? "",
    path,
    file: zip?.file ?? null,
  };
  // A receipt describes the submitted package, never a later selection.
  // Retain its site link as history when the current package or destination changes.
  const currentReceipt =
    receipt && samePublication(receipt, scope) ? receipt : null;
  const currentFeedback =
    feedback && samePublication(feedback.scope, scope) ? feedback : null;
  const busy = operation !== null;
  const error = currentFeedback?.error ?? "";
  const message = currentFeedback?.message ?? "";
  const operationLabel = operation
    ? !samePublication(operation.scope, scope)
      ? "Concluindo operação anterior…"
      : operation.kind === "loading"
        ? "Conferindo sites da VPS…"
        : operation.kind === "publishing"
          ? "Enviando ZIP…"
          : "Conferindo publicação…"
    : "";

  async function load() {
    if (locked.current) return;
    locked.current = true;
    setOperation({ kind: "loading", scope });
    setFeedback(null);
    setConfirmation(null);
    try {
      const result = await lerEstado({});
      if (mounted.current) {
        setState(result);
        setSelectedId("");
        setFeedback({
          scope: { ...scope, siteId: "" },
          message: result.sites.length
            ? "Escolha o site e confira o domínio antes de publicar."
            : "Nenhum site cadastrado. Crie um em Servidor → Sites.",
        });
      }
    } catch (cause) {
      if (mounted.current) {
        setState(null);
        setSelectedId("");
        setFeedback({
          scope: { ...scope, siteId: "" },
          error:
            cause instanceof Error
              ? cause.message
              : "Não foi possível consultar os sites da VPS.",
        });
      }
    } finally {
      locked.current = false;
      if (mounted.current) setOperation(null);
    }
  }

  async function publish() {
    if (locked.current || !confirmation) return;
    // A package, destination or path change invalidates an earlier confirmation.
    if (
      !canPublish ||
      !zip ||
      confirmation.file !== zip.file ||
      confirmation.site.id !== selectedId ||
      confirmation.domain !== domain
    ) {
      setConfirmation(null);
      setFeedback({
        scope,
        error:
          "O pacote ou o destino mudou. Confira e confirme a publicação novamente.",
      });
      return;
    }
    const submitted = confirmation;
    const submittedScope: PublicationScope = {
      siteId: submitted.site.id,
      domain: submitted.domain,
      path,
      file: submitted.file,
    };
    locked.current = true;
    setOperation({ kind: "publishing", scope: submittedScope });
    setFeedback(null);
    try {
      const result = await enviarZip(submitted.site.id, submitted.file);
      if (!mounted.current) return;
      setConfirmation(null);
      if (!result.ok) {
        setFeedback({
          scope: submittedScope,
          error: [
            result.mensagem,
            ...result.problemas.map(
              (problem) => `${problem.arquivo}: ${problem.motivo}`,
            ),
          ].join(" · "),
        });
        return;
      }
      setReceipt({
        ...submittedScope,
        siteName: submitted.site.nome,
        releaseId: result.versao.id,
        confirmed: false,
      });
      setFeedback({
        scope: submittedScope,
        message: `ZIP enviado. Aguardando o agente da VPS aplicar esta versão.${result.avisos.length ? ` Avisos: ${result.avisos.join(" · ")}` : ""}`,
      });
    } catch (cause) {
      if (mounted.current) {
        setConfirmation(null);
        setFeedback({
          scope: submittedScope,
          error:
            cause instanceof Error
              ? cause.message
              : "O envio não foi confirmado. Consulte o site antes de tentar novamente.",
        });
      }
    } finally {
      locked.current = false;
      if (mounted.current) setOperation(null);
    }
  }

  async function checkRelease() {
    if (!currentReceipt || locked.current) return;
    const checking = currentReceipt;
    locked.current = true;
    setOperation({ kind: "checking", scope: checking });
    setFeedback(null);
    try {
      const result = await lerEstado({ siteId: checking.siteId });
      if (!mounted.current) return;
      const release = result.site?.versoes.find(
        (item) => item.id === checking.releaseId,
      );
      const confirmed = Boolean(
        release?.estado === "no_servidor" &&
        release.ativa &&
        result.site?.servidorInforma === checking.releaseId,
      );
      setReceipt({ ...checking, confirmed });
      if (release?.estado === "falhou")
        setFeedback({
          scope: checking,
          error:
            release.erro ||
            "A VPS não conseguiu aplicar esta versão. Veja os detalhes do site.",
        });
      else
        setFeedback({
          scope: checking,
          message: confirmed
            ? "Versão confirmada pelo agente e ativa na VPS. Confira domínio e HTTPS em Servidor → Sites; isso não é uma conferência pública de disponibilidade."
            : "Esta versão ainda não foi confirmada como ativa pelo agente. Consulte novamente em instantes.",
        });
    } catch (cause) {
      if (mounted.current)
        setFeedback({
          scope: checking,
          error:
            cause instanceof Error
              ? cause.message
              : "Não foi possível conferir a publicação.",
        });
    } finally {
      locked.current = false;
      if (mounted.current) setOperation(null);
    }
  }

  return (
    <section
      className="pub__campo"
      aria-label="Publicação real na VPS"
      aria-busy={busy}
    >
      <span>Publicar o pacote na VPS</span>
      <div role="status" aria-label="Estado da publicação" aria-live="polite">
        <FlowStatusBadge
          tone={
            busy
              ? "info"
              : error
                ? "danger"
                : currentReceipt?.confirmed
                  ? "success"
                  : currentReceipt
                    ? "warning"
                    : canPublish
                      ? "success"
                      : zip
                        ? "warning"
                        : "neutral"
          }
          busy={busy}
        >
          {busy
            ? operationLabel
            : error
              ? "Ação não concluída"
              : currentReceipt?.confirmed
                ? "Confirmado na VPS"
                : currentReceipt
                  ? "Aguardando agente da VPS"
                  : canPublish
                    ? "Pronto para revisar"
                    : zip
                      ? "Destino pendente"
                      : "Rascunho — ZIP pendente"}
        </FlowStatusBadge>
      </div>
      <small className="pub__hint">
        O ZIP será publicado como uma versão inteira do site. Este envio não
        cria um caminho isolado nem junta páginas de outros blocos.
      </small>
      <button
        type="button"
        className="pub__btn"
        disabled={busy}
        onClick={() => void load()}
      >
        {operation?.kind === "loading"
          ? "Conferindo sites…"
          : "Carregar meus sites da VPS"}
      </button>
      {state ? (
        <>
          <label className="pub__campo">
            <span>Site que receberá o ZIP</span>
            <select
              className="pub__input"
              aria-label="Site que receberá o ZIP"
              value={selectedId}
              disabled={busy}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setConfirmation(null);
              }}
            >
              <option value="">Escolha um site existente</option>
              {state.sites.map((site) => (
                <option
                  key={site.id}
                  value={site.id}
                  disabled={site.estado === "removendo"}
                >
                  {site.nome} · {site.servidorNome}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <label className="pub__campo">
              <span>Domínio do site selecionado</span>
              <select
                className="pub__input"
                aria-label="Domínio do site selecionado"
                value={domainMatches ? domain : ""}
                disabled={busy}
                onChange={(event) => {
                  onDomainChange(event.target.value);
                  setConfirmation(null);
                }}
              >
                <option value="">Escolha o domínio de destino</option>
                {selected.dominios.map((item) => (
                  <option key={item.hostname} value={item.hostname}>
                    {item.hostname}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!state.podeAlterar ? (
            <div role="alert" className="pub__hint">
              <p>
                O painel não está habilitado para enviar comandos. Confira a
                configuração do Servidor.
              </p>
              <ul>
                {state.pendencias
                  .filter((item) => !item.ok)
                  .map((item) => (
                    <li key={item.chave}>
                      {item.texto} — {item.ondePegar}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
      {!zip ? (
        <small className="pub__hint">
          Anexe e confira um ZIP nesta aba antes de publicar. O nome salvo no
          rascunho não contém os arquivos.
        </small>
      ) : null}
      {!isRoot ? (
        <small className="pub__hint">
          Para este envio, defina o Caminho como /. Publicar apenas uma
          subpágina ainda não é suportado; não substituiremos o site por um ZIP
          de subpágina.
        </small>
      ) : null}
      <small className="pub__hint">
        As opções de SEO, pixels, proteção, saídas e back redirect deste painel
        são rascunhos: não são injetadas no ZIP. Apenas o conteúdo do pacote
        será enviado.
      </small>
      {confirmation ? (
        <div
          role="group"
          aria-label="Confirmar substituição do site"
          className="pub__check"
        >
          <p>
            Substituir todo o conteúdo ativo de{" "}
            <strong>{confirmation.site.nome}</strong> em{" "}
            <strong>{confirmation.domain}</strong> pelo pacote{" "}
            <strong>{confirmation.file.name}</strong>? Páginas que não estiverem
            neste ZIP deixam de fazer parte da nova versão.
          </p>
          <div className="pub__linha">
            <button
              ref={cancel}
              type="button"
              className="pub__btn"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="pub__btn"
              disabled={busy || !canPublish}
              onClick={() => void publish()}
            >
              {operation?.kind === "publishing"
                ? "Enviando ZIP…"
                : "Confirmar substituição e enviar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="pub__btn"
          disabled={busy || !canPublish}
          onClick={() => {
            if (selected && zip && domain)
              setConfirmation({ site: selected, file: zip.file, domain });
          }}
        >
          Revisar publicação
        </button>
      )}
      {currentReceipt ? (
        <div className="pub__linha">
          <button
            type="button"
            className="pub__btn"
            disabled={busy}
            onClick={() => void checkRelease()}
          >
            {operation?.kind === "checking"
              ? "Conferindo publicação…"
              : "Verificar publicação"}
          </button>
          <a
            className="pub__btn"
            href={`/servidor/sites/${currentReceipt.siteId}`}
          >
            Ver site e versões
          </a>
        </div>
      ) : receipt ? (
        <small className="pub__hint">
          Este pacote ou destino não corresponde à versão enviada antes.{" "}
          <a href={`/servidor/sites/${receipt.siteId}`}>
            Ver versão anterior em {receipt.siteName}
          </a>
        </small>
      ) : null}
      {error ? (
        <p role="alert" className="pub__hint">
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="pub__hint">
        {message}
      </p>
    </section>
  );
}
