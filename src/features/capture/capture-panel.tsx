"use client";

import * as React from "react";

import { nomeDoArquivo, validarUrl } from "./capture-model";

/*
  A tela do Asimov Site Downloader, na pele Asimov Capture: um card de
  vidro sobre o fundo escuro, um campo de URL, as opções, um botão e um
  log ao vivo.

  É SÓ A INTERFACE, a pedido do dono: nada é buscado nem baixado de
  verdade. Ao "capturar", o log e a barra de sucesso são encenados para
  mostrar o desenho; o texto da tela diz que é demonstração.
*/

type Estado = "pronto" | "capturando" | "concluido";

interface LinhaDeLog {
  glifo: "›" | "✓" | "!" | "✗";
  texto: string;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CapturePanel() {
  const [url, setUrl] = React.useState("");
  const [rapido, setRapido] = React.useState(true);
  const [formato, setFormato] = React.useState<"html" | "zip">("zip");
  const [estado, setEstado] = React.useState<Estado>("pronto");
  const [invalido, setInvalido] = React.useState(false);
  const [log, setLog] = React.useState<LinhaDeLog[]>([]);
  const [nome, setNome] = React.useState<string | null>(null);
  const [segundos, setSegundos] = React.useState(0);
  const campo = React.useRef<HTMLInputElement>(null);
  const vivo = React.useRef(true);
  React.useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (estado !== "capturando") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  const registrar = (linha: LinhaDeLog) => {
    if (vivo.current) setLog((l) => [...l, linha]);
  };

  const capturar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (estado === "capturando") return;
    const valida = validarUrl(url);
    if (!valida.ok) {
      setInvalido(true);
      campo.current?.focus();
      window.setTimeout(() => setInvalido(false), 1400);
      return;
    }
    setEstado("capturando");
    setSegundos(0);
    setNome(null);
    setLog([{ glifo: "›", texto: `validando ${valida.host}` }]);

    // Encenação: só o desenho do fluxo. Nenhuma rede, nenhum arquivo.
    await espera(500);
    registrar({ glifo: "!", texto: "demonstração — a captura não está ligada" });
    await espera(600);
    registrar({
      glifo: "›",
      texto: rapido ? "montando o arquivo" : "removendo scripts e montando",
    });
    await espera(600);
    const arquivo = nomeDoArquivo(valida.url, formato);
    registrar({ glifo: "✓", texto: `concluído · ${arquivo}` });
    if (!vivo.current) return;
    setNome(arquivo);
    setEstado("concluido");
  };

  const statusTexto =
    estado === "capturando"
      ? `capturando · ${segundos}s`
      : estado === "concluido"
        ? "concluído"
        : "pronto";

  return (
    <div className="asimov-capture">
      <div className="ac-stage">
        <form
          className="ac-card"
          onSubmit={capturar}
          aria-label="Baixar uma cópia de página (demonstração)"
        >
          <div className="ac-card-line" aria-hidden="true" />
          <header className="ac-head">
            <div className="ac-brand">
              <span className="ac-mark" aria-hidden="true">
                A
              </span>
              <span className="ac-brand-name">
                Asimov Capture <span className="ac-ver">3.0</span>
              </span>
            </div>
            <span className="ac-status" data-estado={estado}>
              <i aria-hidden="true" />
              {statusTexto}
            </span>
          </header>

          <p className="ac-lead">
            Cole o endereço de uma página e baixe uma cópia que abre no seu
            computador. Use para arquivar ou guardar páginas suas.
          </p>

          <div className={`ac-input-wrap${invalido ? " ac-invalid" : ""}`}>
            <span className="ac-chevron" aria-hidden="true">
              ›
            </span>
            <input
              ref={campo}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://seusite.com/pagina"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              disabled={estado === "capturando"}
              aria-label="Endereço da página"
            />
          </div>

          <label className="ac-toggle">
            <input
              type="checkbox"
              checked={rapido}
              onChange={(e) => setRapido(e.target.checked)}
              disabled={estado === "capturando"}
            />
            <span>
              <b>Modo rápido</b> — salva o HTML como veio (sem ele, remove os
              scripts para uma cópia estática)
            </span>
          </label>

          <fieldset className="ac-format" disabled={estado === "capturando"}>
            <legend>Formato</legend>
            <label>
              <input
                type="radio"
                name="ac-formato"
                checked={formato === "zip"}
                onChange={() => setFormato("zip")}
              />
              <span>Pacote (.zip)</span>
            </label>
            <label>
              <input
                type="radio"
                name="ac-formato"
                checked={formato === "html"}
                onChange={() => setFormato("html")}
              />
              <span>Página (.html)</span>
            </label>
          </fieldset>

          <button
            type="submit"
            className="ac-grab"
            disabled={estado === "capturando"}
          >
            {estado === "capturando" ? (
              <>
                <span className="ac-spinner" aria-hidden="true" />
                Capturando
              </>
            ) : (
              <>
                Baixar página <span aria-hidden="true">→</span>
              </>
            )}
          </button>

          {log.length > 0 && (
            <div className="ac-log" role="log" aria-live="polite">
              <div className="ac-log-head">stream // grabber.py</div>
              {log.map((linha, i) => (
                <p key={i} className="ac-log-line" data-glifo={linha.glifo}>
                  <span aria-hidden="true">{linha.glifo}</span> {linha.texto}
                </p>
              ))}
            </div>
          )}

          {nome && estado === "concluido" && (
            <div className="ac-success" role="status">
              <span className="ac-check" aria-hidden="true">
                ✓
              </span>
              <div className="ac-success-body">
                <b>Página capturada (demonstração)</b>
                <span>{nome} · nada foi baixado de verdade</span>
              </div>
            </div>
          )}

          <p className="ac-note">
            <b>Demonstração:</b> esta tela é só a interface — a captura não
            está ligada. Quando estiver, vale só para páginas suas ou que
            você tem direito de copiar.
          </p>
        </form>
      </div>
    </div>
  );
}
