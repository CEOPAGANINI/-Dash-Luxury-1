"use client";

import * as React from "react";
import type { SiteDTO } from "@/features/vps/modelo";
import {
  enviarZip,
  lerEstado,
  type EstadoDaTela,
} from "@/features/vps/vps-cliente";
import type { PreparedPageZip } from "./page-zip";

type Props = {
  zip: PreparedPageZip | null;
  domain?: string;
  path: string;
  onDomainChange: (domain: string) => void;
};

/** The API publishes a WHOLE site version. Never silently treat it as a path upload. */
export function PageVpsPublisher({ zip, domain, path, onDomainChange }: Props) {
  const [state, setState] = React.useState<EstadoDaTela | null>(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [confirmation, setConfirmation] = React.useState<{
    site: SiteDTO;
    file: File;
    domain: string;
  } | null>(null);
  const [receipt, setReceipt] = React.useState<{
    siteId: string;
    releaseId: string;
  } | null>(null);
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

  async function load() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setConfirmation(null);
    try {
      const result = await lerEstado({});
      if (mounted.current) {
        setState(result);
        setSelectedId("");
        setMessage(
          result.sites.length
            ? "Escolha o site e confira o domínio antes de publicar."
            : "Nenhum site cadastrado. Crie um em Servidor → Sites.",
        );
      }
    } catch (cause) {
      if (mounted.current) {
        setState(null);
        setSelectedId("");
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível consultar os sites da VPS.",
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
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
      setError(
        "O pacote ou o destino mudou. Confira e confirme a publicação novamente.",
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setReceipt(null);
    try {
      const result = await enviarZip(confirmation.site.id, confirmation.file);
      if (!mounted.current) return;
      setConfirmation(null);
      if (!result.ok) {
        setError(
          [
            result.mensagem,
            ...result.problemas.map(
              (problem) => `${problem.arquivo}: ${problem.motivo}`,
            ),
          ].join(" · "),
        );
        return;
      }
      setReceipt({ siteId: confirmation.site.id, releaseId: result.versao.id });
      setMessage(
        `ZIP enviado. Aguardando o agente da VPS aplicar esta versão.${result.avisos.length ? ` Avisos: ${result.avisos.join(" · ")}` : ""}`,
      );
    } catch (cause) {
      if (mounted.current) {
        setConfirmation(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "O envio não foi confirmado. Consulte o site antes de tentar novamente.",
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function checkRelease() {
    if (!receipt || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await lerEstado({ siteId: receipt.siteId });
      if (!mounted.current) return;
      const release = result.site?.versoes.find(
        (item) => item.id === receipt.releaseId,
      );
      if (release?.estado === "falhou")
        setError(
          release.erro ||
            "A VPS não conseguiu aplicar esta versão. Veja os detalhes do site.",
        );
      else if (
        release?.estado === "no_servidor" &&
        release.ativa &&
        result.site?.servidorInforma === receipt.releaseId
      )
        setMessage(
          "Versão confirmada pelo agente e ativa na VPS. Confira domínio e HTTPS em Servidor → Sites; isso não é uma conferência pública de disponibilidade.",
        );
      else
        setMessage(
          "Esta versão ainda não foi confirmada como ativa pelo agente. Consulte novamente em instantes.",
        );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível conferir a publicação.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="pub__campo" aria-label="Publicação real na VPS">
      <span>Publicar o pacote na VPS</span>
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
        {busy ? "Aguarde…" : "Carregar meus sites da VPS"}
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
              Confirmar substituição e enviar
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
      {receipt ? (
        <div className="pub__linha">
          <button
            type="button"
            className="pub__btn"
            disabled={busy}
            onClick={() => void checkRelease()}
          >
            Verificar publicação
          </button>
          <a className="pub__btn" href={`/servidor/sites/${receipt.siteId}`}>
            Ver site e versões
          </a>
        </div>
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
