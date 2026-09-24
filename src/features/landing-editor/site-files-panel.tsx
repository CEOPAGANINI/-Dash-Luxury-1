"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileArchive, FileCode2, FolderOpen, Upload } from "lucide-react";

import {
  formatBytes,
  getHtmlEntries,
  importSiteFiles,
  SITE_PACKAGE_LIMITS,
  type SitePackage,
} from "./site-package";
import styles from "./site-files-panel.module.css";

const ACCEPTED_FILES =
  ".zip,.html,.htm,.css,.js,.mjs,.json,.txt,.svg,.png,.jpg,.jpeg,.webp,.gif,.avif,.ico,.woff,.woff2,.ttf,.otf";
const CODE_PREVIEW_BYTES = 100_000;

/** Changing account identity discards this component's in-memory files. */
export function SiteFilesPanel({ storageId }: { storageId: string }) {
  return <SiteFilesWorkspace key={storageId} />;
}

function SiteFilesWorkspace() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const importing = useRef(false);
  const restoreFocus = useRef(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [site, setSite] = useState<SitePackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (confirmReplace) cancelButtonRef.current?.focus();
    else if (!busy && restoreFocus.current) {
      restoreFocus.current = false;
      if (importButtonRef.current && !importButtonRef.current.disabled)
        importButtonRef.current.focus();
      else inputRef.current?.focus();
    }
  }, [busy, confirmReplace]);

  async function performImport() {
    if (importing.current || !selected.length) return;
    importing.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const imported = await importSiteFiles(selected);
      if (!mounted.current) return;
      setSite(imported);
      setSelected([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage(
        `${imported.files.length} ${imported.files.length === 1 ? "arquivo importado" : "arquivos importados"} nesta aba. Nenhum arquivo foi enviado à VPS.`,
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível importar. Verifique os arquivos e tente novamente.",
      );
    } finally {
      importing.current = false;
      if (mounted.current) {
        restoreFocus.current = true;
        setBusy(false);
        setConfirmReplace(false);
      }
    }
  }

  const entries = site ? getHtmlEntries(site) : [];
  const totalBytes =
    site?.files.reduce((sum, file) => sum + file.data.byteLength, 0) ?? 0;
  const entry = site?.files.find((file) => file.path === site.entryPath);

  return (
    <section className={styles.root} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div>
          <h2 id={`${id}-title`}>Arquivos da loja</h2>
          <p>Importe o site estático que será usado na sua loja.</p>
        </div>
        <span className={styles.localBadge}>Somente nesta aba</span>
      </header>

      <div className={styles.localNotice}>
        <strong>Arquivos nesta aba; ainda não enviados à VPS</strong>
        <p>
          Os arquivos ficam apenas na memória. Ao recarregar, sair desta área ou
          trocar de conta, você precisará importá-los novamente.
        </p>
      </div>

      <div className={styles.workspace}>
        <div className={styles.importPanel} data-dashboard-surface>
          <FileArchive size={24} aria-hidden="true" />
          <h3>Importar site</h3>
          <p>
            Selecione um ZIP ou vários arquivos HTML, CSS, JS, imagens e fontes.
            Inclua pelo menos uma página HTML.
          </p>
          <p className={styles.hint}>
            Para manter a estrutura de pastas e os caminhos das imagens, prefira
            um ZIP. Não misture ZIP e arquivos soltos.
          </p>

          <label className={styles.field} htmlFor={`${id}-files`}>
            Selecionar arquivos do site
          </label>
          <input
            className={styles.fileInput}
            id={`${id}-files`}
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILES}
            disabled={busy}
            aria-describedby={`${id}-limits`}
            onChange={(event) => {
              setSelected(Array.from(event.currentTarget.files ?? []));
              setConfirmReplace(false);
              setError("");
              setMessage("");
            }}
          />
          <p className={styles.limits} id={`${id}-limits`}>
            ZIP até {formatBytes(SITE_PACKAGE_LIMITS.archiveBytes)}; cada
            arquivo até {formatBytes(SITE_PACKAGE_LIMITS.fileBytes)}; site
            extraído até {formatBytes(SITE_PACKAGE_LIMITS.totalBytes)}. Máximo
            de {SITE_PACKAGE_LIMITS.files} arquivos e pastas. Não envie senhas,
            chaves ou arquivos de configuração secretos.
          </p>

          {selected.length > 0 && (
            <div className={styles.selection}>
              <strong>
                {selected.length}{" "}
                {selected.length === 1
                  ? "arquivo selecionado"
                  : "arquivos selecionados"}
              </strong>
              <ul aria-label="Arquivos selecionados">
                {selected.slice(0, 5).map((file, index) => (
                  <li key={`${file.name}-${index}`}>{file.name}</li>
                ))}
              </ul>
              {selected.length > 5 && (
                <p>E mais {selected.length - 5} arquivos.</p>
              )}
            </div>
          )}

          <button
            ref={importButtonRef}
            className={styles.primary}
            type="button"
            disabled={busy || !selected.length || confirmReplace}
            onClick={() => {
              if (site) setConfirmReplace(true);
              else void performImport();
            }}
          >
            <Upload size={16} aria-hidden="true" />
            {busy ? "Importando…" : "Importar arquivos"}
          </button>

          {confirmReplace && (
            <div
              className={styles.confirmation}
              role="group"
              aria-labelledby={`${id}-replace-title`}
              aria-describedby={`${id}-replace-description`}
            >
              <h4 id={`${id}-replace-title`}>Substituir arquivos atuais?</h4>
              <p id={`${id}-replace-description`}>
                O pacote atual será substituído somente se a nova importação for
                válida. A escolha do HTML inicial também será redefinida.
              </p>
              <div className={styles.actions}>
                <button
                  ref={cancelButtonRef}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    restoreFocus.current = true;
                    setConfirmReplace(false);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className={styles.primary}
                  type="button"
                  disabled={busy}
                  onClick={() => void performImport()}
                >
                  Substituir arquivos
                </button>
              </div>
            </div>
          )}

          <div className={styles.feedback}>
            <p role="status" aria-live="polite">
              {busy ? "Lendo e validando os arquivos. Aguarde…" : message}
            </p>
            {error && (
              <p role="alert">
                {error}
                {site && " O pacote anterior foi mantido."}
              </p>
            )}
          </div>
        </div>

        <div
          className={styles.inventory}
          data-dashboard-surface
          aria-busy={busy}
        >
          {!site ? (
            <div className={styles.empty}>
              <FolderOpen size={30} aria-hidden="true" />
              <h3>Nenhum site importado</h3>
              <p>
                Depois de importar, confira os arquivos e escolha a página HTML
                inicial. Importar não publica o site.
              </p>
            </div>
          ) : (
            <>
              <header className={styles.packageHeader}>
                <div>
                  <h3>{site.name}</h3>
                  <p>Pacote local do site</p>
                </div>
                <dl className={styles.metrics}>
                  <div>
                    <dt>Arquivos</dt>
                    <dd>{site.files.length}</dd>
                  </div>
                  <div>
                    <dt>Tamanho total</dt>
                    <dd>{formatBytes(totalBytes)}</dd>
                  </div>
                </dl>
              </header>

              <div className={styles.entryPicker}>
                <label className={styles.field} htmlFor={`${id}-entry`}>
                  Página HTML inicial
                </label>
                <select
                  id={`${id}-entry`}
                  value={site.entryPath}
                  disabled={busy}
                  aria-describedby={`${id}-entry-help`}
                  onChange={(event) => {
                    const entryPath = event.currentTarget.value;
                    if (entries.includes(entryPath))
                      setSite({ ...site, entryPath });
                  }}
                >
                  {entries.map((path) => (
                    <option key={path} value={path}>
                      {path}
                    </option>
                  ))}
                </select>
                <p id={`${id}-entry-help`}>
                  Define a entrada deste pacote local. Ainda não altera o
                  endereço público da loja.
                </p>
              </div>

              <div
                className={styles.fileList}
                tabIndex={0}
                role="region"
                aria-label="Lista de arquivos importados"
              >
                <table>
                  <caption>Arquivos importados</caption>
                  <thead>
                    <tr>
                      <th scope="col">Arquivo</th>
                      <th scope="col">Tamanho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {site.files.map((file) => (
                      <tr key={file.path}>
                        <th scope="row">
                          <span>{file.path}</span>{" "}
                          {file.path === site.entryPath && (
                            <small>Página inicial</small>
                          )}
                        </th>
                        <td>{formatBytes(file.data.byteLength)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {entry && <HtmlSource key={entry.path} data={entry.data} />}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function HtmlSource({ data }: { data: Uint8Array }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.source}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <FileCode2 size={16} aria-hidden="true" />
        Ver código HTML
      </summary>
      {open && (
        <div>
          <p>Somente leitura. O HTML e os scripts não são executados.</p>
          {data.byteLength > CODE_PREVIEW_BYTES && (
            <p>
              Exibindo apenas os primeiros 100 KB do HTML. O arquivo importado
              permanece completo.
            </p>
          )}
          <pre tabIndex={0} aria-label="Código HTML da página inicial">
            <code>
              {new TextDecoder().decode(data.subarray(0, CODE_PREVIEW_BYTES))}
            </code>
          </pre>
        </div>
      )}
    </details>
  );
}
