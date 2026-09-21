"use client";

import * as React from "react";

import { formatCurrency, formatInteger, formatPercent, formatRatio } from "@/features/unified-dashboard/formatters";
import { lucroDaCampanha, useTaxas } from "./fees-store";
import { METRICAS, moverNaOrdem, useMetricsOrder, type MetricaId } from "./metrics-order-store";
import { PainelFlutuante } from "./painel-flutuante";
import { INTERVALO_AMOSTRA_MS, type Amostra } from "./roas-history-store";
import { derivadas, somarMetricas, type CampaignRow } from "./types";

/*
  O painel dos números de um bloco: abre ao clicar no quadrado dos
  números do cabeçalho. Primeiro o gráfico ao vivo do ROAS (uma leitura
  a cada cinco minutos); depois todas as métricas somadas das campanhas
  do bloco (investimento, receita, ROAS e a faixa, lucro, margem,
  compras, CPA, impressões, cliques, CTR, CPC e CPM), com um filtro por
  página do bloco (a mesma paginação das faixas) e os quadradinhos
  arrastáveis, na ordem que o usuário escolher.
*/

export const FAIXAS_DO_GRAFICO = { mediano: 1.5, otimo: 2 } as const;

const cents = (v: number) => formatCurrency(v / 100, v !== 0 && Math.abs(v) < 10_000 ? 2 : 0);
const centsOuTraco = (v: number | null) => (v === null ? "—" : cents(v));
const hora = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** A faixa do ROAS (id sem acento, para atributos e CSS). */
export function faixaDoRoas(roas: number | null): "sem" | "ruim" | "mediano" | "otimo" {
  if (roas === null) return "sem";
  if (roas >= FAIXAS_DO_GRAFICO.otimo) return "otimo";
  if (roas >= FAIXAS_DO_GRAFICO.mediano) return "mediano";
  return "ruim";
}
const NOME_DA_FAIXA = { sem: "sem investimento", ruim: "ruim", mediano: "mediano", otimo: "ótimo" } as const;
/** O nome da faixa, para ler. */
export function rotuloDaFaixa(roas: number | null): string {
  return NOME_DA_FAIXA[faixaDoRoas(roas)];
}

/* Uma imagem transparente de 1×1 para o arrasto não mostrar o quadradinho cinza. */
let imagemVaziaCache: HTMLImageElement | null = null;
function imagemVazia(): HTMLImageElement {
  if (!imagemVaziaCache) {
    imagemVaziaCache = new Image(1, 1);
    imagemVaziaCache.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  return imagemVaziaCache;
}

/** O valor de cada métrica, já formatado, para uma lista de campanhas. */
export function valoresDasMetricas(campanhas: readonly CampaignRow[], gatewayPercentual: number): Record<MetricaId, string> {
  const soma = somarMetricas(campanhas.map((c) => c.metrics));
  const d = derivadas(soma);
  const lucro = lucroDaCampanha(soma, gatewayPercentual).lucroCents;
  return {
    investimento: cents(soma.spendCents),
    receita: cents(soma.revenueCents),
    roas: d.roas === null ? "—" : formatRatio(d.roas),
    lucro: lucro < 0 ? `−${cents(-lucro)}` : cents(lucro),
    margem: d.margem === null ? "—" : formatPercent(d.margem),
    compras: formatInteger(soma.purchases),
    cpa: centsOuTraco(d.cpaCents),
    impressoes: formatInteger(soma.impressions),
    cliques: formatInteger(soma.clicks),
    ctr: d.ctr === null ? "—" : formatPercent(d.ctr, 2),
    cpc: centsOuTraco(d.cpcCents),
    cpm: centsOuTraco(d.cpmCents),
  };
}

/** As campanhas de uma página do bloco (a mesma paginação das faixas). */
export function campanhasDaPagina(campanhas: readonly CampaignRow[], porPagina: number | undefined, pagina: number | "todas"): readonly CampaignRow[] {
  if (pagina === "todas" || !porPagina || porPagina <= 0) return campanhas;
  return campanhas.slice((pagina - 1) * porPagina, pagina * porPagina);
}

export function PainelDoBloco({
  ancora,
  rotulo,
  campanhas,
  amostras,
  porPagina,
  onClose,
  id,
}: {
  ancora: HTMLElement;
  rotulo: string;
  campanhas: readonly CampaignRow[];
  amostras: readonly Amostra[];
  /** Quantas faixas cabem numa página do bloco: define o filtro por página. */
  porPagina?: number;
  onClose: () => void;
  id?: string;
}) {
  /* O filtro por página: as mesmas páginas das faixas do bloco. */
  const paginas = porPagina && porPagina > 0 ? Math.ceil(campanhas.length / porPagina) : 1;
  const [pagina, setPagina] = React.useState<number | "todas">("todas");
  const paginaValida = pagina !== "todas" && pagina > paginas ? "todas" : pagina;
  const selecionadas = campanhasDaPagina(campanhas, porPagina, paginaValida);
  const { gatewayPercentual } = useTaxas();
  const valores = valoresDasMetricas(selecionadas, gatewayPercentual);
  const roasSelecionado = derivadas(somarMetricas(selecionadas.map((c) => c.metrics))).roas;
  /* A ordem das métricas é do usuário: arrasta um quadradinho para o
     lugar de outro e a ordem fica guardada, como os blocos do quadro. */
  const { ordem, guardar } = useMetricsOrder();
  const [ordemViva, setOrdemViva] = React.useState<MetricaId[] | null>(null);
  const ordemVisivel = ordemViva ?? ordem;
  const [arrastando, setArrastando] = React.useState<MetricaId | null>(null);
  const pousoRef = React.useRef<{ id: MetricaId; desde: number } | null>(null);
  const gradeRef = React.useRef<HTMLDListElement>(null);
  const posicoesAntes = React.useRef(new Map<string, DOMRect>());
  const chave = ordemVisivel.join(",");
  React.useLayoutEffect(() => {
    const grade = gradeRef.current;
    if (!grade) return;
    const antes = posicoesAntes.current;
    const depois = new Map<string, DOMRect>();
    const reduzido = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const tile of grade.querySelectorAll<HTMLElement>("[data-metrica]")) {
      const id = tile.dataset.metrica ?? "";
      const emVoo = typeof tile.getAnimations === "function" ? tile.getAnimations() : [];
      const visual = emVoo.length ? tile.getBoundingClientRect() : null;
      for (const a of emVoo) a.cancel();
      const agora = tile.getBoundingClientRect();
      depois.set(id, agora);
      const antiga = visual ?? antes.get(id);
      if (!antiga || reduzido || antes.size === 0 || typeof tile.animate !== "function") continue;
      const dx = antiga.left - agora.left;
      const dy = antiga.top - agora.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
    posicoesAntes.current = depois;
  }, [chave]);
  function abrirEspaco(destino: MetricaId) {
    if (!arrastando || arrastando === destino) return;
    const nova = moverNaOrdem(ordemVisivel, arrastando, destino);
    if (nova.join(",") !== chave) setOrdemViva(nova);
  }
  function terminarArrasto(destino?: MetricaId) {
    if (arrastando) {
      let final = ordemVisivel;
      if (destino && ordemViva === null) final = moverNaOrdem(ordemVisivel, arrastando, destino);
      if (final.join(",") !== ordem.join(",")) guardar(final);
    }
    setArrastando(null);
    setOrdemViva(null);
    pousoRef.current = null;
  }
  function moverPorTeclado(idMetrica: MetricaId, passo: -1 | 1) {
    const i = ordemVisivel.indexOf(idMetrica);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= ordemVisivel.length) return;
    const nova = [...ordemVisivel];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    guardar(nova);
  }
  return (
    <PainelFlutuante id={id} ancora={ancora} rotulo={`Números do bloco ${rotulo}`} onClose={onClose} larguraMinima={520} className="class-board-tags class-board-bloco-numeros">
      <GraficoRoas amostras={amostras} rotulo={rotulo} />
      <div className="class-board-bloco-numeros-cabecalho">
        <p className="class-board-bloco-numeros-titulo">
          <b>{selecionadas.length}</b> {selecionadas.length === 1 ? "campanha" : "campanhas"} somadas
          {paginaValida !== "todas" && <span> · página {paginaValida}</span>}
        </p>
        {paginas > 1 && (
          <div className="class-board-grafico-janelas class-board-bloco-paginas" role="group" aria-label="Página do bloco">
            <button type="button" aria-pressed={paginaValida === "todas"} onClick={() => setPagina("todas")}>Todas</button>
            {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={paginaValida === n} aria-label={`Página ${n}`} onClick={() => setPagina(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <dl ref={gradeRef} className="campanha-card-flutuante-metricas class-board-bloco-metricas" aria-label={`Métricas somadas de ${rotulo}`}>
        {ordemVisivel.map((idMetrica) => {
          const nome = METRICAS.find((m) => m.id === idMetrica)?.rotulo ?? idMetrica;
          return (
            <div
              key={idMetrica}
              data-metrica={idMetrica}
              data-arrastando={arrastando === idMetrica ? "true" : undefined}
              draggable
              tabIndex={0}
              aria-label={`${nome}: ${valores[idMetrica]}. Arraste para mudar de lugar; setas pelo teclado.`}
              title="Arraste para mudar de lugar"
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-metrica", idMetrica);
                e.dataTransfer.effectAllowed = "move";
                if (typeof e.dataTransfer.setDragImage === "function") e.dataTransfer.setDragImage(imagemVazia(), 0, 0);
                setArrastando(idMetrica);
              }}
              onDragOver={(e) => {
                if (!arrastando) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const emVoo = typeof e.currentTarget.getAnimations === "function" && e.currentTarget.getAnimations().length > 0;
                if (emVoo || idMetrica === arrastando) return;
                const agora = e.timeStamp;
                if (pousoRef.current?.id !== idMetrica) {
                  pousoRef.current = { id: idMetrica, desde: agora };
                  return;
                }
                if (agora - pousoRef.current.desde < 120) return;
                abrirEspaco(idMetrica);
              }}
              onDrop={(e) => { e.preventDefault(); terminarArrasto(idMetrica); }}
              onDragEnd={() => terminarArrasto()}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); moverPorTeclado(idMetrica, -1); }
                if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); moverPorTeclado(idMetrica, 1); }
              }}
            >
              <dt>{idMetrica === "roas" && roasSelecionado !== null ? `ROAS · ${rotuloDaFaixa(roasSelecionado)}` : nome}</dt>
              <dd data-lucro={idMetrica === "lucro" ? (valores.lucro.startsWith("−") ? "negativo" : "positivo") : undefined}>{valores[idMetrica]}</dd>
            </div>
          );
        })}
      </dl>
    </PainelFlutuante>
  );
}

/* O gráfico do ROAS ao vivo, no desenho de um gráfico de cotação:
   linha em neon na cor da faixa da leitura mais nova, com uma sombra em
   degradê por baixo; eixo dos valores à esquerda e os horários embaixo;
   pílulas de período em cima (1h, 3h, 12h, 24h); ao passar o mouse, um
   cursor tracejado com um ponto na linha e um cartão no canto com data
   e hora, o valor grande, a variação em % desde o começo do período, o
   máximo e o mínimo. Sem mouse, só a linha. Uma série só: sem legenda. A tabela das leituras existe
   para leitores de tela. */
const LARGURA = 480;
const ALTURA = 200;
/** No painel da campanha o gráfico é uma faixa baixa e sempre igual. */
const ALTURA_COMPACTA = 116;
const MARGEM = { cima: 16, direita: 14, baixo: 26, esquerda: 44 };
export const JANELAS = [
  { id: "1h", rotulo: "1h", ms: 60 * 60_000 },
  { id: "3h", rotulo: "3h", ms: 3 * 60 * 60_000 },
  { id: "12h", rotulo: "12h", ms: 12 * 60 * 60_000 },
  { id: "24h", rotulo: "24h", ms: 24 * 60 * 60_000 },
] as const;
export type JanelaId = string;
/** As janelas do gráfico por minuto (o card da campanha). */
export const JANELAS_MINUTO = [
  { id: "15m", rotulo: "15m", ms: 15 * 60_000 },
  { id: "1h", rotulo: "1h", ms: 60 * 60_000 },
  { id: "3h", rotulo: "3h", ms: 3 * 60 * 60_000 },
  { id: "6h", rotulo: "6h", ms: 6 * 60 * 60_000 },
] as const;
export type Janela = { id: string; rotulo: string; ms: number };
const COR_DA_FAIXA = { sem: "#f4f4f5", ruim: "#ff3b3b", mediano: "#ffd60a", otimo: "#3dff6a" } as const;
const dataHora = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(" de ", " ").replace(".,", " ·").replace(",", " ·");
const variacao = (de: number, para: number) => (de > 0 ? ((para - de) / de) * 100 : 0);
const percentualComSinal = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** As leituras dentro da janela (as últimas N horas até a mais nova). */
export function leiturasDaJanela(amostras: readonly Amostra[], janela: JanelaId, janelas: readonly Janela[] = JANELAS): Amostra[] {
  const ms = janelas.find((j) => j.id === janela)?.ms ?? janelas[janelas.length - 1].ms;
  const fim = amostras.length ? amostras[amostras.length - 1].t : 0;
  return amostras.filter((a) => a.t >= fim - ms);
}

export function GraficoRoas({
  amostras,
  rotulo,
  janelas = JANELAS,
  intervaloMs = INTERVALO_AMOSTRA_MS,
  cadencia = "5 minutos",
  compacto = false,
}: {
  amostras: readonly Amostra[];
  rotulo: string;
  /** Os períodos do gráfico (o card da campanha usa os de minuto). */
  janelas?: readonly Janela[];
  /** O passo entre leituras, para o eixo do tempo não colapsar com uma só. */
  intervaloMs?: number;
  /** De quanto em quanto tempo entra uma leitura, por extenso. */
  cadencia?: string;
  /** No card da campanha o gráfico é mais baixo e com menos margem. */
  compacto?: boolean;
}) {
  const [janela, setJanela] = React.useState<JanelaId>(janelas[janelas.length - 1].id);
  const [ativo, setAtivo] = React.useState<number | null>(null);
  const visiveis = leiturasDaJanela(amostras, janela, janelas);
  const n = visiveis.length;
  /* O desenho vale em pixels de verdade: o viewBox acompanha a largura
     medida, em vez de esticar um desenho de 480 para a largura do painel
     (o que aumentava a linha e as letras junto). Altura sempre a mesma. */
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [medida, setMedida] = React.useState<{ l: number; a: number } | null>(null);
  React.useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      const l = Math.round(r.width);
      const a = Math.round(r.height);
      if (l > 0 && a > 0) setMedida((atual) => (atual && atual.l === l && atual.a === a ? atual : { l, a }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [n]);
  const larguraMedida = medida?.l ?? null;
  const ALTURA_USADA = compacto ? Math.max(medida?.a ?? ALTURA_COMPACTA, ALTURA_COMPACTA) : ALTURA;
  const MARGEM_USADA = compacto ? { cima: 10, direita: 10, baixo: 18, esquerda: 34 } : MARGEM;
  const LARGURA_USADA = Math.max(larguraMedida ?? LARGURA, MARGEM_USADA.esquerda + MARGEM_USADA.direita + 40);
  const largura = LARGURA_USADA - MARGEM_USADA.esquerda - MARGEM_USADA.direita;
  const altura = ALTURA_USADA - MARGEM_USADA.cima - MARGEM_USADA.baixo;
  const valores = visiveis.map((a) => a.roas);
  const maximo = n ? Math.max(...valores) : 0;
  const minimo = n ? Math.min(...valores) : 0;
  /* O eixo aperta em volta dos valores (como numa cotação), em passos
     redondos de 0,1x, 0,2x, 0,5x ou 1x, com uma folga em cima e embaixo. */
  const passo = [0.1, 0.2, 0.5, 1, 2, 5].find((p) => (maximo - minimo) / p <= 4) ?? 5;
  const base = Math.max(0, Math.floor((minimo - passo * 0.4) / passo) * passo);
  const topo = Math.max(base + passo, Math.ceil((maximo + passo * 0.4) / passo) * passo);
  const passos: number[] = [];
  for (let v = base; v <= topo + 1e-9; v += passo) passos.push(Math.round(v * 1000) / 1000);
  const t0 = n ? visiveis[0].t : 0;
  const t1 = n ? Math.max(visiveis[n - 1].t, t0 + intervaloMs) : 0;
  const x = (t: number) => MARGEM_USADA.esquerda + (n <= 1 ? 0 : ((t - t0) / (t1 - t0)) * largura);
  const y = (v: number) => MARGEM_USADA.cima + altura - ((v - base) / (topo - base)) * altura;
  const pontos = visiveis.map((a) => ({ ...a, x: x(a.t), y: y(a.roas) }));
  const caminho = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const ultimo = pontos[pontos.length - 1];
  const primeiro = pontos[0];
  /* O cursor, o ponto e o cartão só existem com o mouse sobre a linha. */
  const escolhido = ativo !== null && pontos[ativo] ? pontos[ativo] : null;
  const faixa = faixaDoRoas(ultimo ? ultimo.roas : null);
  const cor = COR_DA_FAIXA[faixa];
  /* Horários embaixo: até cinco, espaçados por igual. */
  const marcas = n > 1 ? Array.from({ length: Math.min(5, n) }, (_, i) => t0 + ((t1 - t0) * i) / Math.min(4, n - 1)) : n ? [t0] : [];
  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    if (!n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * LARGURA_USADA;
    let melhor = 0;
    for (let i = 1; i < pontos.length; i++) if (Math.abs(pontos[i].x - px) < Math.abs(pontos[melhor].x - px)) melhor = i;
    setAtivo(melhor);
  }
  return (
    <figure className="class-board-grafico" aria-label={`ROAS de ${rotulo} a cada ${cadencia}`} style={{ ["--serie" as string]: cor }} data-faixa={faixa} data-compacto={compacto ? "true" : undefined}>
      <div className="class-board-grafico-topo">
        <figcaption className="sr-only">ROAS a cada {cadencia}, ao vivo</figcaption>
        <div className="class-board-grafico-janelas" role="group" aria-label="Período do gráfico">
          {janelas.map((j) => (
            <button key={j.id} type="button" aria-pressed={janela === j.id} onClick={() => { setJanela(j.id); setAtivo(null); }}>
              {j.rotulo}
            </button>
          ))}
        </div>
      </div>
      {n === 0 ? (
        <p className="class-board-grafico-vazio">Ainda sem leituras: a primeira entra assim que houver investimento, e depois uma a cada {cadencia}.</p>
      ) : (
        <div className="class-board-grafico-area" ref={areaRef}>
          <svg
            viewBox={`0 0 ${LARGURA_USADA} ${ALTURA_USADA}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${n} leituras; a mais nova ${formatRatio(ultimo.roas)} às ${hora(ultimo.t)}`}
            data-pontos={n}
            onPointerMove={aoMover}
            onPointerLeave={() => setAtivo(null)}
          >
            {/* Grade recessiva e o eixo dos valores à esquerda. */}
            {passos.map((v) => (
              <g key={v}>
                <line x1={MARGEM_USADA.esquerda} x2={MARGEM_USADA.esquerda + largura} y1={y(v)} y2={y(v)} className="class-board-grafico-grade" />
                <text x={MARGEM_USADA.esquerda - 8} y={y(v)} className="class-board-grafico-eixo" textAnchor="end" dominantBaseline="middle">{formatRatio(v, passo < 0.5 ? 2 : 1)}</text>
              </g>
            ))}
            {/* As faixas (1,5x e 2x), quando caem dentro do eixo. */}
            {([["mediano", FAIXAS_DO_GRAFICO.mediano], ["otimo", FAIXAS_DO_GRAFICO.otimo]] as const)
              .filter(([, v]) => v > base && v < topo)
              .map(([id, v]) => (
                <line key={id} x1={MARGEM_USADA.esquerda} x2={MARGEM_USADA.esquerda + largura} y1={y(v)} y2={y(v)} className="class-board-grafico-faixa" data-faixa={id} />
              ))}
            {/* Só a linha: sem degradê por baixo. */}
            {n > 1 && <path d={caminho} className="class-board-grafico-linha" />}
            {/* Uma bolinha por leitura, na cor da classe do ROAS:
                vermelha em baixo, amarela no meio, verde em cima. */}
            {pontos.map((p, i) => (
              <circle
                key={p.t}
                cx={p.x}
                cy={p.y}
                r={3}
                className="class-board-grafico-bolinha"
                data-faixa={faixaDoRoas(p.roas)}
                data-ativo={i === ativo ? "true" : undefined}
              />
            ))}
            {escolhido && (
              <line x1={escolhido.x} x2={escolhido.x} y1={MARGEM_USADA.cima} y2={MARGEM_USADA.cima + altura} className="class-board-grafico-cursor" />
            )}
            {marcas.map((t, i) => (
              <text
                key={i}
                x={x(t)}
                y={ALTURA_USADA - 8}
                className="class-board-grafico-eixo"
                textAnchor={i === 0 ? "start" : i === marcas.length - 1 ? "end" : "middle"}
              >
                {hora(t)}
              </text>
            ))}
          </svg>
          {escolhido && primeiro && (
            <div className="class-board-grafico-cartao" role="status" aria-live="polite" data-faixa={faixaDoRoas(escolhido.roas)}>
              <span className="class-board-grafico-cartao-quando">{dataHora(escolhido.t)}</span>
              <b className="class-board-grafico-cartao-valor">{formatRatio(escolhido.roas)}</b>
              <span className="class-board-grafico-cartao-variacao" data-sinal={escolhido.roas > primeiro.roas ? "sobe" : escolhido.roas < primeiro.roas ? "desce" : "igual"}>
                {percentualComSinal(variacao(primeiro.roas, escolhido.roas))} vs {janela} atrás
              </span>
              <span className="class-board-grafico-cartao-extremos">Máx: {formatRatio(maximo)}</span>
              <span className="class-board-grafico-cartao-extremos">Mín: {formatRatio(minimo)}</span>
            </div>
          )}
        </div>
      )}
      {n > 0 && (
        <table className="sr-only">
          <caption>Leituras do ROAS de {rotulo}</caption>
          <thead><tr><th>Hora</th><th>ROAS</th></tr></thead>
          <tbody>
            {visiveis.map((a) => (
              <tr key={a.t}><td>{hora(a.t)}</td><td>{formatRatio(a.roas)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
