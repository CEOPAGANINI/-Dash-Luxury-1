"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, FileArchive, Upload } from "lucide-react";
import type { FlowPage, LandingFlow } from "./flow-model";
import {
  formatBytes,
  getHtmlEntries,
  importSiteFiles,
  type SitePackage,
} from "./site-package";
import styles from "./page-export-panel.module.css";

type Props = {
  flow: LandingFlow;
  page: FlowPage;
  site: SitePackage | null;
  onSiteChange: (site: SitePackage | null) => void;
};

export function PageExportPanel({ flow, page, site, onSiteChange }: Props) {
  const id = useId();
  const [mode, setMode] = useState<"editor" | "imported">(
    site ? "imported" : "editor",
  );
  const [selected, setSelected] = useState<File[]>([]);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const locked = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (confirmReplace) cancel.current?.focus();
  }, [confirmReplace]);

  function switchMode(next: "editor" | "imported") {
    setMode(next);
    setError("");
    setMessage("");
    setConfirmReplace(false);
  }

  async function importFiles() {
    if (locked.current || !selected.length) return;
    locked.current = true;
    setBusy("import");
    setError("");
    setMessage("");
    try {
      const result = await importSiteFiles(selected);
      if (!mounted.current) return;
      onSiteChange(result);
      setMode("imported");
      setSelected([]);
      if (input.current) input.current.value = "";
      setMessage(
        `Arquivos associados a ${page.name} nesta aba. Nenhum arquivo foi enviado ao servidor.`,
      );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível importar os arquivos.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) {
        setBusy(null);
        setConfirmReplace(false);
      }
    }
  }

  async function download() {
    if (locked.current || (mode === "imported" && !site)) return;
    locked.current = true;
    setBusy("export");
    setError("");
    setMessage("");
    try {
      const { exportFlowPage } = await import("./static-page-export");
      const exported = await exportFlowPage(
        flow,
        page.id,
        mode === "imported" && site ? site : undefined,
      );
      if (!mounted.current) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(exported.bytes)], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = exported.filename;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(
        `ZIP preparado: ${exported.filename} · ${formatBytes(exported.bytes.byteLength)} · ${exported.fileCount} ${exported.fileCount === 1 ? "arquivo" : "arquivos"}. O download foi solicitado. Publique esse ZIP em Servidor → Sites.`,
      );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível exportar esta página.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  return (
    <section className={styles.root} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div>
          <h2 id={`${id}-title`}>ZIP de {page.name}</h2>
          <p>Uma página, um pacote pronto para enviar ao Servidor.</p>
        </div>
        <span className={styles.limit}>Até 3 MB</span>
      </header>
      <div className={styles.modes} aria-label="Conteúdo da exportação">
        <button
          type="button"
          aria-pressed={mode === "editor"}
          disabled={Boolean(busy)}
          onClick={() => switchMode("editor")}
        >
          Usar conteúdo do editor
        </button>
        <button
          type="button"
          aria-pressed={mode === "imported"}
          disabled={Boolean(busy)}
          onClick={() => switchMode("imported")}
        >
          Usar HTML importado
        </button>
      </div>
      <div className={styles.grid}>
        <div className={styles.content} data-dashboard-surface>
          {mode === "editor" ? (
            <>
              <h3>Conteúdo desta página</h3>
              <p>
                O título, a descrição e as ligações do bloco viram uma página
                estática em preto e branco, com CSS próprio.
              </p>
              <dl className={styles.summary}>
                <dt>Título</dt>
                <dd>{page.headline || "Sem título"}</dd>
                <dt>Descrição</dt>
                <dd>{page.description || "Sem descrição"}</dd>
                <dt>Próximos destinos</dt>
                <dd>
                  {
                    flow.connections.filter(
                      (connection) => connection.source === page.id,
                    ).length
                  }{" "}
                  ligações
                </dd>
              </dl>
              <p className={styles.notice}>
                Preencha o endereço das páginas de destino no funil. Aceitar e
                recusar uma oferta são links: o ZIP não cobra pagamentos nem
                mantém um carrinho.
              </p>
              {page.imageUrl ? (
                <p className={styles.notice}>
                  Para incluir imagens e fontes no pacote, use o HTML importado
                  com seus arquivos. A exportação do conteúdo do editor não
                  baixa imagens externas.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h3>Arquivos desta página</h3>
              <p>
                Importe um ZIP completo ou HTML, CSS, JavaScript, imagens e
                fontes. Para preservar subpastas, prefira ZIP.
              </p>
              <label className={styles.field} htmlFor={`${id}-files`}>
                Arquivos desta página
              </label>
              <input
                id={`${id}-files`}
                ref={input}
                type="file"
                multiple
                accept=".zip,.html,.htm,.css,.js,.mjs,.json,.txt,.svg,.png,.jpg,.jpeg,.webp,.gif,.avif,.ico,.woff,.woff2,.ttf,.otf"
                disabled={Boolean(busy)}
                onChange={(event) => {
                  setSelected(Array.from(event.currentTarget.files ?? []));
                  setConfirmReplace(false);
                  setError("");
                  setMessage("");
                }}
              />
              <p className={styles.hint}>
                Importação: ZIP até 20 MiB, arquivos até 10 MiB e total extraído
                até 40 MiB. A exportação final precisa caber em 3.000.000 bytes.
                PHP e .htaccess não são aceitos.
              </p>
              {selected.length ? (
                <p>
                  {selected.length}{" "}
                  {selected.length === 1
                    ? "arquivo selecionado"
                    : "arquivos selecionados"}
                </p>
              ) : null}
              <button
                type="button"
                disabled={Boolean(busy) || !selected.length || confirmReplace}
                onClick={() =>
                  site ? setConfirmReplace(true) : void importFiles()
                }
              >
                <Upload size={16} aria-hidden />
                {busy === "import" ? "Importando…" : "Importar arquivos"}
              </button>
              {confirmReplace ? (
                <div
                  className={styles.confirm}
                  role="group"
                  aria-label="Substituir arquivos desta página"
                >
                  <p>
                    Substituir os arquivos de {page.name}? O pacote atual só
                    será trocado se a importação for válida.
                  </p>
                  <div className={styles.buttons}>
                    <button
                      type="button"
                      ref={cancel}
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setConfirmReplace(false);
                        input.current?.focus();
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void importFiles()}
                    >
                      Substituir arquivos
                    </button>
                  </div>
                </div>
              ) : null}
              {site ? (
                <div className={styles.inventory}>
                  <label className={styles.field} htmlFor={`${id}-entry`}>
                    HTML inicial
                  </label>
                  <select
                    id={`${id}-entry`}
                    value={site.entryPath}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      onSiteChange({ ...site, entryPath: event.target.value });
                      setMessage("");
                      setError("");
                    }}
                  >
                    {getHtmlEntries(site).map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                  <p>
                    {site.files.length}{" "}
                    {site.files.length === 1 ? "arquivo" : "arquivos"} ·{" "}
                    {formatBytes(
                      site.files.reduce(
                        (total, file) => total + file.data.byteLength,
                        0,
                      ),
                    )}{" "}
                    antes da compressão
                  </p>
                  <details>
                    <summary>Ver arquivos do pacote</summary>
                    <ul>
                      {site.files.map((file) => (
                        <li key={file.path}>
                          <span>{file.path}</span>
                          <span>{formatBytes(file.data.byteLength)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              ) : null}
              <p className={styles.notice}>
                O HTML importado mantém seu conteúdo e seus links. Os campos e
                ligações do editor não alteram esse código. Nada é executado
                aqui.
              </p>
            </>
          )}
        </div>
        <aside
          className={styles.delivery}
          data-dashboard-surface
          aria-label="Entrega ao Servidor"
        >
          <FileArchive size={28} aria-hidden />
          <h3>Pacote para publicação</h3>
          <ul>
            <li>
              <code>index.html</code> na raiz
            </li>
            <li>CSS, JS, imagens e fontes incluídos no pacote importado</li>
            <li>ZIP até 3 MB, sem PHP ou .htaccess</li>
          </ul>
          <button
            className={styles.primary}
            type="button"
            disabled={
              Boolean(busy) || (mode === "imported" && !site) || confirmReplace
            }
            onClick={() => void download()}
          >
            <Download size={16} aria-hidden />
            {busy === "export" ? "Preparando ZIP…" : "Baixar ZIP desta página"}
          </button>
          <p>
            Depois do download, publique o ZIP no site escolhido em Servidor →
            Sites: o Servidor do Funil coloca a página no ar e cuida do nginx,
            do domínio e do HTTPS. Este botão não se conecta à VPS.
          </p>
          <p className={styles.notice}>
            Os arquivos importados ficam só nesta aba e não entram no rascunho
            nem no JSON do funil. Guarde o ZIP antes de sair.
          </p>
        </aside>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.feedback} role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
