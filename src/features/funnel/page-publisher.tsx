"use client";

import * as React from "react";

import {
  DadosPagina,
  IndexacaoPagina,
  ProtecaoPagina,
  VelocidadePagina,
  paginaVazia,
} from "./funnel-model";
import { SpeedTest } from "./speed-test";
import {
  DOMINIOS_VPS,
  ITENS_COFRE,
  cofreDoDominio,
  criarSlug,
  dominioPronto,
  saudeDoDominio,
  setCofreDoDominio,
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

const ABAS: { id: Aba; rotulo: string; sub: string; cor: string }[] = [
  {
    id: "essencial",
    rotulo: "Essencial",
    sub: "Domínio, caminho e o que falta para publicar",
    cor: "#34d399",
  },
  {
    id: "conteudo",
    rotulo: "Conteúdo",
    sub: "O ZIP da sua página (index.html na raiz)",
    cor: "#60a5fa",
  },
  {
    id: "seo",
    rotulo: "SEO",
    sub: "Título, descrição, imagem e favicon",
    cor: "#fbbf24",
  },
  {
    id: "rastreio",
    rotulo: "Rastreio",
    sub: "Pixel, GA4, GTM e Clarity",
    cor: "#c084fc",
  },
  {
    id: "velocidade",
    rotulo: "Velocidade",
    sub: "O Turbo que deixa a página leve",
    cor: "#38bdf8",
  },
  {
    id: "protecao",
    rotulo: "Proteção",
    sub: "Dificultar copiarem a sua página",
    cor: "#fb923c",
  },
  {
    id: "saidas",
    rotulo: "Saídas",
    sub: "Ligar os botões às próximas etapas",
    cor: "#f87171",
  },
];

/** Ícone de cada aba (traço, herda a cor do texto). */
function IconeAba({ id }: { id: Aba }) {
  const paths: Record<Aba, React.ReactNode> = {
    essencial: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
      </>
    ),
    conteudo: (
      <>
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
        <path d="M12 3v12" />
        <path d="M8 7l4-4 4 4" />
      </>
    ),
    seo: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>
    ),
    rastreio: <path d="M3 12h4l3 8 4-16 3 8h4" />,
    velocidade: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
    protecao: <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />,
    saidas: (
      <>
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="18" cy="6" r="2.4" />
        <circle cx="18" cy="18" r="2.4" />
        <path d="M8.3 11 15.7 7" />
        <path d="M8.3 13 15.7 17" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[id]}
    </svg>
  );
}

const PROTECOES: { id: keyof ProtecaoPagina; rotulo: string }[] = [
  { id: "cliqueDireito", rotulo: "Bloquear botão direito" },
  { id: "atalhos", rotulo: "Bloquear F12, Ctrl+U, Ctrl+S…" },
  { id: "selecao", rotulo: "Impedir selecionar/copiar texto" },
  { id: "imagens", rotulo: "Impedir arrastar/salvar imagens" },
  { id: "devtools", rotulo: "Desfocar se abrir o inspecionar" },
];

const BLOQUEIOS: { id: keyof IndexacaoPagina; rotulo: string; dica: string }[] = [
  { id: "noindex", rotulo: "Esconder do Google (noindex)", dica: "A página não aparece nos resultados de busca." },
  { id: "nofollow", rotulo: "Não seguir os links (nofollow)", dica: "Robôs não passam pelos links desta página." },
  { id: "foraDoSitemap", rotulo: "Fora do sitemap.xml e do sitemap index", dica: "Não listar a página nos mapas do site." },
  { id: "robotsDisallow", rotulo: "Bloquear no robots.txt (Disallow)", dica: "Atenção: bloqueado, o Google não lê o noindex e o link pode aparecer sem descrição. Para sumir da busca e continuar acessível, use só o noindex." },
  { id: "semCacheTrecho", rotulo: "Sem cache e sem trecho (noarchive, nosnippet)", dica: "Sem cópia salva nem resumo nos resultados." },
  { id: "semImagens", rotulo: "Não indexar imagens (noimageindex)", dica: "As imagens não entram no Google Imagens." },
  { id: "bloquearIA", rotulo: "Bloquear robôs de IA (GPTBot, ClaudeBot, CCBot…)", dica: "Impede que treinem modelos com a página." },
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
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

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
  const indexacao: IndexacaoPagina = {
    ...dados.meta.indexacao,
    noindex: dados.meta.indexacao?.noindex ?? dados.meta.esconderDoGoogle,
  };

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

      <div className="pub__body">
        <nav className="pub__rail" aria-label="Configurações da página">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="pub__rail-btn"
              data-on={aba === a.id || undefined}
              style={{ "--aba-cor": a.cor } as React.CSSProperties}
              onClick={() => setAba(a.id)}
              title={a.rotulo}
              aria-label={a.rotulo}
            >
              <span className="pub__rail-ic" aria-hidden>
                <IconeAba id={a.id} />
              </span>
              <span className="pub__rail-lbl">{a.rotulo}</span>
            </button>
          ))}
        </nav>

        <div className="pub__corpo">
          <div
            className="pub__sec"
            style={{ "--aba-cor": abaAtual.cor } as React.CSSProperties}
          >
            <span className="pub__sec-badge" aria-hidden>
              <IconeAba id={abaAtual.id} />
            </span>
            <span className="pub__sec-txt">
              <b className="pub__sec-titulo">{abaAtual.rotulo}</b>
              <span className="pub__sec-sub">{abaAtual.sub}</span>
            </span>
          </div>

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
            {dados.dominio && (
              <div
                className="pub__campo pub__cofre"
                data-on={cofreDoDominio(dados.dominio) || undefined}
              >
                <button
                  type="button"
                  className="pub__cofre-topo"
                  role="switch"
                  aria-checked={cofreDoDominio(dados.dominio)}
                  onClick={() => {
                    const on = !cofreDoDominio(dados.dominio!);
                    setCofreDoDominio(dados.dominio!, on);
                    // Reflete nas abas SEO e Proteção desta página.
                    setMeta({
                      esconderDoGoogle: on,
                      indexacao: on
                        ? {
                            noindex: true,
                            nofollow: true,
                            foraDoSitemap: true,
                            // Sem Disallow para o Google: ele precisa ler
                            // o noindex para tirar a página da busca.
                            robotsDisallow: false,
                            semCacheTrecho: true,
                            semImagens: true,
                            bloquearIA: true,
                          }
                        : {},
                      protecao: on
                        ? {
                            cliqueDireito: true,
                            atalhos: true,
                            selecao: true,
                            imagens: true,
                            devtools: true,
                          }
                        : {},
                    });
                    forcar();
                  }}
                >
                  <span className="pub__cofre-ic" aria-hidden>
                    🔒
                  </span>
                  <span className="pub__cofre-txt">
                    <b>Modo cofre do domínio</b>
                    <small>
                      Tranca <em>{dados.dominio}</em> inteiro: quem entra só
                      vê a página e compra — nada além disso.
                    </small>
                  </span>
                  <span
                    className="pub__toggle-track"
                    data-on={cofreDoDominio(dados.dominio) || undefined}
                  >
                    <span className="pub__toggle-knob" />
                  </span>
                </button>
                <ul className="pub__cofre-lista">
                  {ITENS_COFRE.map((it) => (
                    <li key={it.id} data-grupo={it.grupo}>
                      <span className="pub__cofre-dot" aria-hidden />
                      <span className="pub__cofre-item">
                        {it.rotulo}
                        <small>{it.dica}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                <small className="pub__hint">
                  {cofreDoDominio(dados.dominio)
                    ? "Trancado. Vira robots.txt, cabeçalhos e regras do site na publicação (Fase 2) — aqui só fica configurado."
                    : "Ligue para trancar tudo de uma vez. Dá para afinar item por item nas abas SEO e Proteção."}
                </small>
              </div>
            )}
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
            <div className="pub__campo">
              <span>Bloqueios de busca e rastreadores</span>
              <div className="pub__panel pub__panel--solto">
                {BLOQUEIOS.map((b) => (
                  <Toggle
                    key={b.id}
                    rotulo={b.rotulo}
                    dica={b.dica}
                    on={Boolean(indexacao[b.id])}
                    onToggle={(on) => {
                      const nova = { ...indexacao, [b.id]: on };
                      // noindex continua espelhado no campo antigo.
                      setMeta({
                        indexacao: nova,
                        ...(b.id === "noindex" ? { esconderDoGoogle: on } : {}),
                      });
                    }}
                  />
                ))}
              </div>
              <small className="pub__hint">
                Vira meta robots, robots.txt e sitemap na publicação (Fase 2).
                Aqui só fica configurado.
              </small>
            </div>
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
            <div className="pub__panel">
              <Toggle
                rotulo="Repassar UTM para as próximas etapas"
                on={dados.meta.repassarUtm ?? true}
                onToggle={(v) => setMeta({ repassarUtm: v })}
              />
            </div>
          </>
        )}

        {aba === "velocidade" && (
          <>
          <div className="pub__panel">
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
          </div>
          <div className="pub__campo">
            <span>Velocímetro — testar a velocidade</span>
            <small className="pub__hint">
              Mede site, landing ou loja de verdade com o PageSpeed do Google
              (15–40 s). Já vem com o endereço desta página; pode testar
              qualquer outro.
            </small>
            <SpeedTest urlInicial={dados.dominio ? urlFinal : ""} />
          </div>
          </>
        )}

        {aba === "protecao" && (
          <>
            <small className="pub__hint">
              Dificulta copiar a página. Não é à prova de tudo — é demonstração.
            </small>
            <div className="pub__panel">
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
            </div>
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
      </div>

      {/* Rodapé fixo: o Publicar fica sempre à vista, mesmo em telas baixas.
          O meio (acima) é que rola. Só interface: sem VPS, fica em espera. */}
      <footer className="pub__foot">
        <span className="pub__foot-vps">
          <span className="pub__vps-dot" aria-hidden />
          VPS não conectada — publicar liga na Fase 2
        </span>
        <button type="button" className="pub__publicar" disabled>
          🚀 Publicar
        </button>
      </footer>
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
  dica,
  on,
  onToggle,
}: {
  rotulo: string;
  dica?: string;
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
      <span className="pub__toggle-txt">
        {rotulo}
        {dica && <small>{dica}</small>}
      </span>
    </button>
  );
}

export { paginaVazia };
