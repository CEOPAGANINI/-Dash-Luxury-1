"use client";

import * as React from "react";

import {
  DadosPagina,
  ProtecaoPagina,
  VelocidadePagina,
  paginaVazia,
} from "./funnel-model";
import {
  DOMINIOS_VPS,
  criarSlug,
  dominioPronto,
  saudeDoDominio,
  slugsDoDominio,
} from "@/features/vps/catalogo-demo";

/*
  O publicador do bloco "Página" — só a interface, a pedido do dono. Um
  painel lateral com abas (Essencial, Conteúdo, SEO, Rastreio, Velocidade,
  Proteção, Saídas): escolher o domínio da VPS e o caminho, arrastar o ZIP
  para conferir, SEO, pixels, o Turbo de velocidade, a proteção anti-cópia
  e as saídas ligadas às próximas etapas. Nada publica nem sobe ZIP de
  verdade: sem VPS conectada, o botão Publicar fica em espera.
*/

type Aba =
  | "essencial"
  | "conteudo"
  | "seo"
  | "rastreio"
  | "velocidade"
  | "protecao"
  | "saidas";

const ABAS: { id: Aba; rotulo: string; cor: string }[] = [
  { id: "essencial", rotulo: "Essencial", cor: "#34d399" },
  { id: "conteudo", rotulo: "Conteúdo", cor: "#60a5fa" },
  { id: "seo", rotulo: "SEO", cor: "#fbbf24" },
  { id: "rastreio", rotulo: "Rastreio", cor: "#c084fc" },
  { id: "velocidade", rotulo: "Velocidade", cor: "#38bdf8" },
  { id: "protecao", rotulo: "Proteção", cor: "#fb923c" },
  { id: "saidas", rotulo: "Saídas", cor: "#f87171" },
];

const PROTECOES: { id: keyof ProtecaoPagina; rotulo: string }[] = [
  { id: "cliqueDireito", rotulo: "Bloquear botão direito" },
  { id: "atalhos", rotulo: "Bloquear F12, Ctrl+U, Ctrl+S…" },
  { id: "selecao", rotulo: "Impedir selecionar/copiar texto" },
  { id: "imagens", rotulo: "Impedir arrastar/salvar imagens" },
  { id: "devtools", rotulo: "Desfocar se abrir o inspecionar" },
];

const VELOCIDADES: { id: keyof VelocidadePagina; rotulo: string }[] = [
  { id: "imagens", rotulo: "Imagens WebP + AVIF" },
  { id: "lazy", rotulo: "Carregar imagens sob demanda (lazy)" },
  { id: "fontes", rotulo: "Texto aparece na hora (font-display)" },
  { id: "minificar", rotulo: "Minificar CSS e JS" },
  { id: "comprimir", rotulo: "Comprimir (Brotli + Gzip)" },
  { id: "cache", rotulo: "Cache de 1 ano com carimbo de versão" },
];

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizarCaminho(c: string): string {
  const t = c.trim();
  if (!t || t === "/") return "/";
  return "/" + t.replace(/^\/+/, "").replace(/\s+/g, "-").toLowerCase();
}

export interface EtapaDestino {
  id: string;
  nome: string;
  url?: string;
}

export function PagePublisher({
  nome,
  dados,
  onNome,
  onChange,
  proximasEtapas,
  onFechar,
}: {
  nome: string;
  dados: DadosPagina;
  onNome: (n: string) => void;
  onChange: (d: DadosPagina) => void;
  proximasEtapas: EtapaDestino[];
  onFechar: () => void;
}) {
  const [aba, setAba] = React.useState<Aba>("essencial");
  const [novoDominio, setNovoDominio] = React.useState("");
  const [novaSaida, setNovaSaida] = React.useState("");
  const [novoSlug, setNovoSlug] = React.useState("");
  // Bump para re-renderizar quando um slug novo entra no store da sessão.
  const [, forcar] = React.useReducer((x: number) => x + 1, 0);
  const [arrastando, setArrastando] = React.useState(false);
  const inputZip = React.useRef<HTMLInputElement>(null);
  const inputFav = React.useRef<HTMLInputElement>(null);

  const set = (p: Partial<DadosPagina>) => onChange({ ...dados, ...p });
  const setMeta = (p: Partial<DadosPagina["meta"]>) =>
    set({ meta: { ...dados.meta, ...p } });

  const caminho = normalizarCaminho(dados.caminho);
  const urlFinal = dados.dominio
    ? `https://${dados.dominio}${caminho}`
    : "— escolha um domínio";

  // Status do "crachá": rascunho até ter domínio, caminho e ZIP conferido.
  const pronto = Boolean(dados.dominio && dados.zip?.ok);
  const saudeDom = saudeDoDominio(dados.dominio);
  const domPronto = dominioPronto(dados.dominio);
  const checksDominio = [
    { ok: saudeDom.dns, txt: "DNS apontado (registro A)" },
    { ok: saudeDom.propagado, txt: "Domínio propagado" },
    { ok: saudeDom.https, txt: "HTTPS ativo (certificado)" },
  ];
  const caminhoOk = caminho.length > 0;
  const checklist = [
    {
      ok: Boolean(dados.dominio),
      txt: dados.dominio ? "Domínio escolhido" : "Escolha um domínio",
    },
    { ok: caminhoOk, txt: caminhoOk ? "Caminho válido" : "Defina o caminho" },
    {
      ok: Boolean(dados.zip?.ok),
      txt: dados.zip
        ? dados.zip.ok
          ? "ZIP conferido"
          : "ZIP com problema"
        : "Arraste o ZIP (aba Conteúdo)",
    },
    { ok: false, txt: "VPS não conectada" },
  ];

  const receberZip = (f?: File) => {
    if (!f) return;
    const ok = f.name.toLowerCase().endsWith(".zip");
    set({ zip: { nome: f.name, tamanho: f.size, ok } });
  };

  const receberFavicon = (f?: File) => {
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => setMeta({ faviconPng: String(r.result) });
    r.readAsDataURL(f);
  };

  const setSaida = (nomeSaida: string, patch: { etapaId?: string; url?: string }) =>
    set({ saidas: { ...dados.saidas, [nomeSaida]: patch } });

  const removerSaida = (nomeSaida: string) => {
    const s = { ...dados.saidas };
    delete s[nomeSaida];
    set({ saidas: s });
  };

  const velocidade =
    dados.meta.velocidade === false ? null : dados.meta.velocidade ?? {};
  const protecao = dados.meta.protecao ?? {};

  return (
    <aside
      className="pub"
      aria-label="Publicador da página"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="pub__head">
        <div className="pub__head-id">
          <span className="pub__badge" data-on={pronto || undefined}>
            {pronto ? "Pronto" : "Rascunho"}
          </span>
          <input
            className="pub__nome"
            value={nome}
            aria-label="Nome interno da página"
            onChange={(e) => onNome(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="pub__x"
          aria-label="Fechar"
          onClick={onFechar}
        >
          ✕
        </button>
      </header>

      <div className="pub__url" title={urlFinal}>
        {urlFinal}
      </div>

      <nav className="pub__abas" aria-label="Abas do publicador">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className="pub__aba"
            data-on={aba === a.id || undefined}
            style={{ "--aba-cor": a.cor } as React.CSSProperties}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      <div className="pub__corpo">
        {aba === "essencial" && (
          <>
            <label className="pub__campo">
              <span>Adicionar domínio</span>
              <div className="pub__linha">
                <input
                  className="pub__input"
                  value={novoDominio}
                  placeholder="meusite.com.br"
                  onChange={(e) => setNovoDominio(e.target.value)}
                />
                <button
                  type="button"
                  className="pub__btn"
                  onClick={() => {
                    const d = novoDominio.trim().toLowerCase();
                    if (d) set({ dominio: d });
                    setNovoDominio("");
                  }}
                >
                  Usar
                </button>
              </div>
              <small className="pub__hint">
                No painel do domínio, aponte um registro A para o IP da VPS.
                Isso não publica nada aqui.
              </small>
            </label>
            <label className="pub__campo">
              <span>Domínio</span>
              <div className="pub__chips">
                {DOMINIOS_VPS.map((d) => (
                  <button
                    key={d.host}
                    type="button"
                    className="pub__chip"
                    data-on={dados.dominio === d.host || undefined}
                    onClick={() => set({ dominio: d.host })}
                  >
                    <span
                      className="pub__chip-dot"
                      data-estado={d.estado}
                      aria-hidden
                    />
                    {d.host}
                  </button>
                ))}
              </div>
              {dados.dominio && (
                <div className="pub__saude" data-ok={domPronto || undefined}>
                  <div className="pub__saude-topo">
                    {domPronto
                      ? "Domínio pronto para subir a landing"
                      : "Ainda falta para este domínio ficar pronto"}
                  </div>
                  <ul className="pub__saude-lista">
                    {checksDominio.map((c, i) => (
                      <li key={i} data-ok={c.ok || undefined}>
                        <span className="pub__saude-dot" aria-hidden />
                        <span className="pub__saude-txt">{c.txt}</span>
                        <span className="pub__saude-tag">
                          {c.ok ? "ativo" : "aguardando"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!domPronto && (
                    <small className="pub__hint">
                      Aponte um registro A do domínio para o IP da VPS; o HTTPS
                      é emitido sozinho na primeira visita.
                    </small>
                  )}
                </div>
              )}
            </label>
            <label className="pub__campo">
              <span>Caminho</span>
              <input
                className="pub__input"
                value={dados.caminho}
                placeholder="/nova-pagina ou /"
                onChange={(e) => set({ caminho: e.target.value })}
              />
            </label>

            {dados.dominio && (
              <div className="pub__campo">
                <span>Slugs deste domínio</span>
                <ul className="pub__slugs">
                  {slugsDoDominio(dados.dominio).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="pub__slug"
                        data-on={caminho === s.caminho || undefined}
                        onClick={() => set({ caminho: s.caminho })}
                      >
                        <span className="pub__slug-path">{s.caminho}</span>
                        <span className="pub__slug-nome">{s.nome}</span>
                      </button>
                    </li>
                  ))}
                  {slugsDoDominio(dados.dominio).length === 0 && (
                    <li className="pub__slug-vazio">
                      Nenhum slug ainda neste domínio.
                    </li>
                  )}
                </ul>
                <div className="pub__linha">
                  <input
                    className="pub__input"
                    value={novoSlug}
                    placeholder="criar slug: /promo-de-julho"
                    onChange={(e) => setNovoSlug(e.target.value)}
                  />
                  <button
                    type="button"
                    className="pub__btn"
                    onClick={() => {
                      const c = novoSlug.trim();
                      if (!c || !dados.dominio) return;
                      const s = criarSlug(dados.dominio, c);
                      set({ caminho: s.caminho });
                      setNovoSlug("");
                      forcar();
                    }}
                  >
                    + Criar
                  </button>
                </div>
                <small className="pub__hint">
                  Toque num slug para reusar o caminho, ou crie um novo. Isso
                  não publica — só organiza os endereços.
                </small>
              </div>
            )}

            <ul className="pub__check" aria-label="Checklist para publicar">
              {checklist.map((c, i) => (
                <li key={i} data-ok={c.ok || undefined}>
                  <span className="pub__check-mark" aria-hidden>
                    {c.ok ? "✓" : "•"}
                  </span>
                  {c.txt}
                </li>
              ))}
            </ul>
            <div className="pub__vps">
              <span className="pub__vps-dot" aria-hidden />
              VPS não conectada — configure aqui; publicar liga na Fase 2.
            </div>
            <button type="button" className="pub__publicar" disabled>
              🚀 Publicar
            </button>
          </>
        )}

        {aba === "conteudo" && (
          <>
            <div
              className="pub__drop"
              data-drag={arrastando || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                receberZip(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputZip.current?.click()}
              role="button"
              tabIndex={0}
            >
              <b>Arraste o ZIP da página</b>
              <span>ou clique para escolher — index.html na raiz</span>
              <input
                ref={inputZip}
                type="file"
                accept=".zip"
                hidden
                onChange={(e) => receberZip(e.target.files?.[0] ?? undefined)}
              />
            </div>
            {dados.zip && (
              <div className="pub__zip" data-ok={dados.zip.ok || undefined}>
                <b>{dados.zip.nome}</b>
                <span>
                  {bytes(dados.zip.tamanho)} ·{" "}
                  {dados.zip.ok ? "ZIP conferido ✓" : "não é um .zip"}
                </span>
              </div>
            )}
            <small className="pub__hint">
              Use links relativos (./style.css) e marque os botões com{" "}
              <code>data-saida</code> para ligar às próximas etapas na aba
              Saídas.
            </small>
          </>
        )}

        {aba === "seo" && (
          <>
            <Campo
              rotulo="Título"
              value={dados.meta.titulo ?? ""}
              onChange={(v) => setMeta({ titulo: v })}
            />
            <label className="pub__campo">
              <span>Descrição</span>
              <textarea
                className="pub__input"
                rows={3}
                value={dados.meta.descricao ?? ""}
                onChange={(e) => setMeta({ descricao: e.target.value })}
              />
            </label>
            <Campo
              rotulo="Imagem de compartilhamento (og:image)"
              value={dados.meta.imagem ?? ""}
              placeholder="https://…/capa.jpg"
              onChange={(v) => setMeta({ imagem: v })}
            />
            <label className="pub__campo">
              <span>Favicon</span>
              <div className="pub__linha">
                <button
                  type="button"
                  className="pub__btn"
                  onClick={() => inputFav.current?.click()}
                >
                  Arrastar imagem
                </button>
                {dados.meta.faviconPng && (
                  // eslint-disable-next-line @next/next/no-img-element -- preview local (data URL), não vai para produção
                  <img
                    className="pub__fav"
                    src={dados.meta.faviconPng}
                    alt="favicon"
                    width={22}
                    height={22}
                  />
                )}
                <input
                  ref={inputFav}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) =>
                    receberFavicon(e.target.files?.[0] ?? undefined)
                  }
                />
              </div>
            </label>
            <Toggle
              rotulo="Esconder do Google (noindex)"
              on={Boolean(dados.meta.esconderDoGoogle)}
              onToggle={(v) => setMeta({ esconderDoGoogle: v })}
            />
          </>
        )}

        {aba === "rastreio" && (
          <>
            <Campo
              rotulo="Meta Pixel (ID)"
              value={dados.meta.metaPixel ?? ""}
              onChange={(v) => setMeta({ metaPixel: v })}
            />
            <Campo
              rotulo="Google Analytics 4 (ID)"
              value={dados.meta.ga4 ?? ""}
              onChange={(v) => setMeta({ ga4: v })}
            />
            <Campo
              rotulo="Google Tag Manager (ID)"
              value={dados.meta.gtm ?? ""}
              onChange={(v) => setMeta({ gtm: v })}
            />
            <Campo
              rotulo="Microsoft Clarity (ID)"
              value={dados.meta.clarity ?? ""}
              onChange={(v) => setMeta({ clarity: v })}
            />
            <Toggle
              rotulo="Repassar UTM para as próximas etapas"
              on={dados.meta.repassarUtm ?? true}
              onToggle={(v) => setMeta({ repassarUtm: v })}
            />
          </>
        )}

        {aba === "velocidade" && (
          <>
            <Toggle
              rotulo="Turbo (otimização) ligado"
              on={velocidade !== null}
              onToggle={(v) => setMeta({ velocidade: v ? {} : false })}
            />
            {velocidade !== null &&
              VELOCIDADES.map((v) => (
                <Toggle
                  key={v.id}
                  rotulo={v.rotulo}
                  on={Boolean(velocidade[v.id])}
                  onToggle={(on) =>
                    setMeta({ velocidade: { ...velocidade, [v.id]: on } })
                  }
                />
              ))}
          </>
        )}

        {aba === "protecao" && (
          <>
            <small className="pub__hint">
              Dificulta copiar a página. Não é à prova de tudo — é demonstração.
            </small>
            {PROTECOES.map((pp) => (
              <Toggle
                key={pp.id}
                rotulo={pp.rotulo}
                on={Boolean(protecao[pp.id])}
                onToggle={(on) =>
                  setMeta({ protecao: { ...protecao, [pp.id]: on } })
                }
              />
            ))}
          </>
        )}

        {aba === "saidas" && (
          <>
            <small className="pub__hint">
              Ligue cada botão <code>data-saida</code> da página a uma próxima
              etapa do funil (ou a um link).
            </small>
            {Object.keys(dados.saidas).length === 0 && (
              <p className="pub__vazio">
                Nenhuma saída ainda. Adicione uma abaixo ou arraste um ZIP com
                botões marcados.
              </p>
            )}
            {Object.entries(dados.saidas).map(([nomeSaida, s]) => (
              <div className="pub__saida" key={nomeSaida}>
                <div className="pub__saida-head">
                  <b>{nomeSaida}</b>
                  <button
                    type="button"
                    className="pub__saida-del"
                    aria-label={`Remover saída ${nomeSaida}`}
                    onClick={() => removerSaida(nomeSaida)}
                  >
                    ✕
                  </button>
                </div>
                <select
                  className="pub__input"
                  value={s.etapaId ?? ""}
                  onChange={(e) =>
                    setSaida(nomeSaida, {
                      etapaId: e.target.value || undefined,
                      url: e.target.value ? undefined : s.url,
                    })
                  }
                >
                  <option value="">— próxima etapa —</option>
                  {proximasEtapas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </select>
                {!s.etapaId && (
                  <input
                    className="pub__input"
                    value={s.url ?? ""}
                    placeholder="ou um link: https://…"
                    onChange={(e) => setSaida(nomeSaida, { url: e.target.value })}
                  />
                )}
              </div>
            ))}
            <div className="pub__linha">
              <input
                className="pub__input"
                value={novaSaida}
                placeholder="nome da saída (ex.: principal)"
                onChange={(e) => setNovaSaida(e.target.value)}
              />
              <button
                type="button"
                className="pub__btn"
                onClick={() => {
                  const n = novaSaida.trim();
                  if (n && !dados.saidas[n]) setSaida(n, {});
                  setNovaSaida("");
                }}
              >
                + Saída
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Campo({
  rotulo,
  value,
  placeholder,
  onChange,
}: {
  rotulo: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="pub__campo">
      <span>{rotulo}</span>
      <input
        className="pub__input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Toggle({
  rotulo,
  on,
  onToggle,
}: {
  rotulo: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="pub__toggle"
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
    >
      <span className="pub__toggle-track" data-on={on || undefined}>
        <span className="pub__toggle-knob" />
      </span>
      {rotulo}
    </button>
  );
}

export { paginaVazia };
