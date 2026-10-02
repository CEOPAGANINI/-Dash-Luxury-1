"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { FunnelData } from "./funnel-model";
import type { PreparedPageZip } from "./page-zip";
import { PageVpsPublisher } from "./page-vps-publisher";
import { exportFunnelSite } from "./funnel-site-export";
import { restorePackages } from "./package-cloud";
import { packageReferenceIds } from "./package-references";
import { FlowStatusBadge } from "./flow-ui";
import styles from "./content-editor.module.css";

export function FunnelSitePublisher({
  data,
  storageId,
  onClose,
}: {
  data: FunnelData;
  storageId: string;
  onClose: () => void;
}) {
  const initialDomain =
    data.nodes.find((node) => node.pagina?.dominio)?.pagina?.dominio ??
    data.nodes.find((node) => node.loja?.dominio)?.loja?.dominio ??
    "";
  const [domain, setDomain] = React.useState(initialDomain);
  const [zip, setZip] = React.useState<PreparedPageZip | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [routes, setRoutes] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [review, setReview] = React.useState("");
  const preparing = React.useRef(false);
  const signature = JSON.stringify(data);
  const current = React.useRef({ signature, domain });
  React.useLayoutEffect(() => {
    current.current = { signature, domain };
  }, [signature, domain]);
  const validZip = review === `${domain}:${signature}` ? zip : null;
  async function prepare() {
    if (preparing.current) return;
    preparing.current = true;
    const before = `${domain}:${signature}`;
    setBusy(true);
    setError("");
    setZip(null);
    setWarnings([]);
    try {
      await restorePackages(storageId, data.id, packageReferenceIds(data));
      const output = await exportFunnelSite(data, storageId, domain);
      if (before !== `${current.current.domain}:${current.current.signature}`)
        throw new Error(
          "O funil ou o domínio mudou. Confira novamente antes de publicar.",
        );
      const file = new File(
        [Uint8Array.from(output.bytes).buffer],
        output.filename,
        { type: "application/zip" },
      );
      setZip({
        file,
        fileCount: output.fileCount,
        metadata: { nome: file.name, tamanho: file.size, ok: true },
      });
      setReview(before);
      setWarnings(output.warnings);
      setRoutes(output.routes);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar o site. Nada foi publicado.",
      );
    } finally {
      preparing.current = false;
      setBusy(false);
    }
  }
  function download() {
    if (!validZip) return;
    const url = URL.createObjectURL(validZip.file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = validZip.file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <div
          className="funnel flow-portal-scope"
          data-tema={data.mapa?.tema ?? "padrao"}
        >
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog}>
            <header className={styles.header}>
              <div>
                <Dialog.Title>Publicar o site completo do funil</Dialog.Title>
                <Dialog.Description>
                  Um único ZIP com página inicial, produtos e etapas em seus
                  caminhos. Cada publicação substitui a versão inteira do site
                  escolhido.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className={styles.close}
                aria-label="Fechar publicação"
              >
                <X size={20} />
              </Dialog.Close>
            </header>
            <div className={styles.fields}>
              <label>
                Domínio do site na VPS
                <input
                  value={domain}
                  placeholder="sua-loja.com"
                  onChange={(event) => setDomain(event.target.value.trim())}
                  autoComplete="off"
                />
              </label>
            </div>
            <p className={styles.notice}>
              Configure uma página com caminho /. As outras páginas precisam de
              caminhos exclusivos, como /colecoes, /produto e /obrigado. Páginas
              em outro domínio são destinos externos. Nenhum arquivo será
              enviado até a confirmação abaixo.
            </p>
            <div
              role="status"
              aria-label="Estado da preparação"
              aria-live="polite"
              aria-busy={busy}
            >
              <FlowStatusBadge
                tone={
                  busy
                    ? "info"
                    : error
                      ? "danger"
                      : validZip
                        ? "success"
                        : zip
                          ? "warning"
                          : "neutral"
                }
                busy={busy}
              >
                {busy
                  ? "Conferindo arquivos e ligações…"
                  : error
                    ? "Falha na preparação"
                    : validZip
                      ? "ZIP pronto para revisão"
                      : zip
                        ? "Preparação desatualizada"
                        : "Rascunho — prepare o pacote"}
              </FlowStatusBadge>
            </div>
            <button
              type="button"
              className="funnel__btn"
              disabled={busy || !domain}
              onClick={() => void prepare()}
            >
              {busy
                ? "Conferindo arquivos e ligações…"
                : "Preparar ZIP único (até 3 MB)"}
            </button>
            {error && <p role="alert">{error}</p>}
            {zip && !validZip && (
              <p role="status">
                O funil ou o domínio mudou. Prepare novamente para publicar a
                seleção atual.
              </p>
            )}
            {validZip && (
              <section aria-label="Revisão do site">
                <p>
                  {validZip.fileCount} arquivos ·{" "}
                  {(validZip.file.size / 1_000_000).toFixed(2)} MB ·{" "}
                  {routes.length} caminhos
                </p>
                <ul>
                  {routes.map((route) => (
                    <li key={route}>
                      <code>{route}</code>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="funnel__btn"
                  onClick={download}
                >
                  Baixar cópia do ZIP completo
                </button>
              </section>
            )}
            {validZip && warnings.length > 0 && (
              <section aria-label="Limitações e avisos da exportação">
                <h3>Confira antes de publicar</h3>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}
            <PageVpsPublisher
              zip={validZip}
              domain={domain}
              path="/"
              onDomainChange={setDomain}
            />
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
