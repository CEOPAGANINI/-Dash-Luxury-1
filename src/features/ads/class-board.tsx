"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Megaphone, Pin, Plus, X } from "lucide-react";

import type { ProfitGuardrails } from "@/features/guardrails/rules";
import { cn } from "@/lib/utils";
import {
  setCampaignClassAction,
  updateAdEntityAction,
} from "./actions";
import {
  PILARES,
  campaignClassLabel,
  isCampaignClass,
  isPilar,
  pilarDaClasse,
  pilarLabel,
  type CampaignClassId,
  type PilarId,
} from "./campaign-classes";
import { useCampaignClasses } from "./campaign-class-store";
import {
  CORES_ETIQUETA,
  CORES_NEON,
  corDaEtiqueta,
  isCorEtiqueta,
  isCorNeon,
  useCardNotes,
  type CorNeon,
  type Etiqueta,
  type NotasDoCartao,
} from "./card-notes-store";
import { TituloDoBloco } from "./block-tag-picker";
import { corDaTag, useBlockTags } from "./block-tags-store";
import { NETWORK_MANAGERS } from "./manager-model";
import {
  ALTURA_MAXIMA,
  GRADE,
  LARGURA_MAXIMA,
  TAMANHO_PADRAO,
  blocosExistentes,
  chaveDaCampanha,
  isBlocoPersonalizado,
  rotuloDoBloco,
  tamanhoDoBloco,
  useBoardBlocks,
  type Tamanho,
} from "./board-blocks-store";
import { CampaignHoverCard, type CampaignPreview } from "./campaign-hover-card";
import { ROTULO_DA_SAUDE, Semaforo, descricaoDaSaude, saudeDasMetricas, saudeDoConjunto } from "./campaign-health";
import { GraficoRoas, JANELAS_MINUTO } from "./block-metrics-panel";
import { INTERVALO_MINUTO_MS, chaveDaCampanhaNoHistorico, registrarRoasDaCampanha, useCampaignRoasHistory } from "./campaign-roas-history-store";
import { lucroDaCampanha, useTaxas } from "./fees-store";
import { QuadroAoVivo } from "./class-board-live";
import { PainelDoBloco } from "./block-metrics-panel";
import { INTERVALO_AMOSTRA_MS, chaveDoHistorico, registrarRoasDoBloco, useRoasHistory } from "./roas-history-store";
import { PainelFlutuante } from "./painel-flutuante";
import { useCampaignDemo } from "./demo-store";
import {
  STATUS_LABEL,
  derivadas,
  somarMetricas,
  type AdNetwork,
  type CampaignRow,
  type CampaignTree,
} from "./types";
import { formatCurrency, formatInteger, formatPercent, formatRatio } from "@/features/unified-dashboard/formatters";

/* Os números de um bloco: a soma do investimento e da receita das
   campanhas dele e o ROAS dessa soma, em três faixas fixas:
   "ruim" abaixo de 1,5x; "mediano" de 1,5x até 2x; "otimo" de 2x para
   cima; "sem": sem investimento (nada a classificar). */
export type EstadoDoRoas = "sem" | "ruim" | "mediano" | "otimo";
export const FAIXAS_ROAS = { mediano: 1.5, otimo: 2 } as const;
export const ROTULO_DO_ROAS: Record<EstadoDoRoas, string> = { sem: "", ruim: "ruim", mediano: "mediano", otimo: "ótimo" };
export function estadoDoRoas(roas: number | null): EstadoDoRoas {
  if (roas === null) return "sem";
  if (roas >= FAIXAS_ROAS.otimo) return "otimo";
  if (roas >= FAIXAS_ROAS.mediano) return "mediano";
  return "ruim";
}
export function numerosDoBloco(campanhas: readonly CampaignRow[]) {
  const soma = somarMetricas(campanhas.map((c) => c.metrics));
  const roas = derivadas(soma).roas;
  return { investimentoCents: soma.spendCents, receitaCents: soma.revenueCents, roas, estado: estadoDoRoas(roas) };
}
/* A ordem do quadro é pelo ROAS: os blocos com investimento vêm do maior
   ROAS para o menor; os sem investimento ficam depois, na ordem do
   usuário (a ordenação é estável: empates seguem essa ordem). */
export function ordenarPorRoas(ordem: readonly string[], roasDe: (id: string) => number | null): string[] {
  return [...ordem]
    .map((id, i) => ({ id, i, roas: roasDe(id) }))
    .sort((a, b) => {
      if (a.roas === null && b.roas === null) return a.i - b.i;
      if (a.roas === null) return 1;
      if (b.roas === null) return -1;
      return b.roas - a.roas || a.i - b.i;
    })
    .map((x) => x.id);
}

/*
  O quadro de classes.

  Uma coluna por classe de trabalho — Teste de criativos, Teste de
  público, Aquecimento de pixel, Pré-escala, Escala… — e um cartão por
  campanha dentro dela, como num quadro de tarefas. Clicar no megafone do
  cartão abre os números da campanha; a seta abre a página dela. Arrastar
  pelo megafone, ou o seletor no cartão, muda a classe.

  A classe é organização, não estratégia: nunca vai para a rede de
  anúncios. Em demonstração ela fica neste navegador (o mesmo cofre dos
  gerenciadores por rede); com banco, é gravada na campanha.
*/

/** Onde a ordem dos pilares escolhida pelo usuário fica guardada. */
export const ORDEM_PILARES_KEY = "dash-classes-ordem-pilares";

const ORDEM: string[] = PILARES.map((p) => p.id);

/* A grade do quadro: cinco colunas e, por padrão, três fileiras (ver
   GRADE no cofre dos blocos). Os seis blocos "Outras campanhas" ficam
   presos à esquerda, em duas colunas de três (pilar 1: blocos 1–3;
   pilar 2: blocos 4–6); os outros preenchem o resto na ordem escolhida
   pelo usuário. Um bloco pode ocupar várias células (largura e altura
   à escolha); quando não cabe tudo em três fileiras, a grade ganha
   fileiras. */
export { GRADE } from "./board-blocks-store";
export const FIXOS_ESQUERDA: readonly PilarId[] = ["unclassified", "others-2", "others-3", "others-4", "big-1", "big-2"];
/** Onde ficam guardados os blocos fixados pelo usuário. */
export const FIXOS_KEY = "dash-luxury:pilares-fixos:v1";
/** A vaga (grid-area, "fileira / coluna") das seis vagas padrão à esquerda. */
function vagaFixa(posicao: number): string {
  return `${(posicao % GRADE.fileiras) + 1} / ${Math.floor(posicao / GRADE.fileiras) + 1}`;
}
const VAGA = /^([1-9]) \/ ([1-9])$/;
const FILEIRAS_MAXIMAS = 9;
function vagaValida(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = VAGA.exec(v);
  return !!m && Number(m[1]) <= FILEIRAS_MAXIMAS && Number(m[2]) <= GRADE.colunas;
}
const ID_BLOCO = /^[a-z0-9-]{1,40}$/;
/** Os fixos padrão: os seis "Outras campanhas" nas duas colunas da esquerda. */
function fixosPadrao(): Map<string, string> {
  return new Map(FIXOS_ESQUERDA.map((p, i) => [p, vagaFixa(i)]));
}
const UM: Tamanho = TAMANHO_PADRAO;
/* Onde cada bloco começa na grade ("fileira / coluna" da célula de cima
   à esquerda): os fixos nas vagas marcadas (um fixo que já não cabe na
   largura da grade encosta à esquerda; um que cairia em cima de outro
   fixo perde a vaga); os outros entram na primeira vaga livre onde o seu
   tamanho cabe, fileira por fileira, na ordem do usuário. Assim, fixar
   um bloco prende-o na vaga exata em que ele está agora. */
export function vagasDaGrade(
  ordem: readonly string[],
  fixos: ReadonlyMap<string, string>,
  tamanho: (id: string) => Tamanho = () => UM,
): Map<string, string> {
  const vagas = new Map<string, string>();
  const ocupadas = new Set<string>();
  const cabe = (fileira: number, coluna: number, t: Tamanho) => {
    if (coluna + t.largura - 1 > GRADE.colunas) return false;
    for (let f = fileira; f < fileira + t.altura; f++) {
      for (let c = coluna; c < coluna + t.largura; c++) if (ocupadas.has(`${f} / ${c}`)) return false;
    }
    return true;
  };
  const ocupar = (fileira: number, coluna: number, t: Tamanho) => {
    for (let f = fileira; f < fileira + t.altura; f++) {
      for (let c = coluna; c < coluna + t.largura; c++) ocupadas.add(`${f} / ${c}`);
    }
  };
  for (const [id, vaga] of fixos) {
    const m = VAGA.exec(vaga);
    if (!ordem.includes(id) || !m) continue;
    const t = tamanho(id);
    const fileira = Number(m[1]);
    const coluna = Math.max(1, Math.min(Number(m[2]), GRADE.colunas - t.largura + 1));
    if (!cabe(fileira, coluna, t)) continue;
    vagas.set(id, `${fileira} / ${coluna}`);
    ocupar(fileira, coluna, t);
  }
  for (const id of ordem) {
    if (vagas.has(id)) continue;
    const t = tamanho(id);
    let fileira = 1;
    let vaga: string | null = null;
    while (!vaga) {
      for (let coluna = 1; coluna + t.largura - 1 <= GRADE.colunas; coluna++) {
        if (cabe(fileira, coluna, t)) { vaga = `${fileira} / ${coluna}`; ocupar(fileira, coluna, t); break; }
      }
      fileira += 1;
    }
    vagas.set(id, vaga);
  }
  return vagas;
}
/** O grid-area de um bloco: só a vaga quando é 1×1; com o tamanho, senão. */
export function areaDaGrade(vaga: string, t: Tamanho): string {
  return t.largura === 1 && t.altura === 1 ? vaga : `${vaga} / span ${t.altura} / span ${t.largura}`;
}
/* A grade desenhada tem, antes de cada fileira de blocos, uma linha fina
   com a barra da faixa ("Faixa 1 · 5 blocos", + Bloco, Apagar faixa):
   a fileira lógica f fica na linha 2f da grade (a barra na 2f−1), e um
   bloco de h fileiras atravessa 2h−1 linhas. */
export function linhaDosBlocos(fileira: number): number {
  return fileira * 2;
}
/* A ordem de encaixe de um bloco quando a grade vira duas colunas: a
   faixa dele primeiro, depois a coluna. (Com as cinco colunas, a vaga
   marcada manda e o `order` não muda nada.) */
export function ordemNaFaixa(vaga: string): number {
  const m = VAGA.exec(vaga);
  if (!m) return 0;
  return Number(m[1]) * 10 + Number(m[2]);
}
export function areaComFaixas(vaga: string, t: Tamanho): string {
  const m = VAGA.exec(vaga);
  if (!m) return vaga;
  const fileira = Number(m[1]);
  const coluna = Number(m[2]);
  const inicio = linhaDosBlocos(fileira);
  const fim = linhaDosBlocos(fileira + t.altura - 1);
  return `${inicio} / ${coluna} / span ${fim - inicio + 1} / span ${t.largura}`;
}
/* O tamanho do bloco da campanha aberta: três blocos de largura por três
   de altura (as faixas ficam com dois blocos de largura, à esquerda). */
export const PAINEL_DA_CAMPANHA = { largura: 3, altura: 3 } as const;
export function vagaDoPainelDaCampanha(fileiras: number) {
  return { largura: Math.min(PAINEL_DA_CAMPANHA.largura, GRADE.colunas), altura: Math.min(PAINEL_DA_CAMPANHA.altura, Math.max(fileiras, 1)) };
}
/** Quantas fileiras a grade precisa: três, ou mais se os blocos descerem além. */
export function fileirasDaGrade(vagas: ReadonlyMap<string, string>, tamanho: (id: string) => Tamanho): number {
  let fileiras: number = GRADE.fileiras;
  for (const [id, vaga] of vagas) {
    const m = VAGA.exec(vaga);
    if (m) fileiras = Math.max(fileiras, Number(m[1]) + tamanho(id).altura - 1);
  }
  return fileiras;
}
/** As células da grade que nenhum bloco ocupa ("fileira / coluna"). */
export function celulasLivres(vagas: ReadonlyMap<string, string>, tamanho: (id: string) => Tamanho, fileiras: number): string[] {
  const ocupadas = new Set<string>();
  for (const [id, vaga] of vagas) {
    const m = VAGA.exec(vaga);
    if (!m) continue;
    const t = tamanho(id);
    for (let f = Number(m[1]); f < Number(m[1]) + t.altura; f++) {
      for (let c = Number(m[2]); c < Number(m[2]) + t.largura; c++) ocupadas.add(`${f} / ${c}`);
    }
  }
  const livres: string[] = [];
  for (let f = 1; f <= fileiras; f++) {
    for (let c = 1; c <= GRADE.colunas; c++) if (!ocupadas.has(`${f} / ${c}`)) livres.push(`${f} / ${c}`);
  }
  return livres;
}
/* O nome na faixa cabe numa linha só: até NOME_MAXIMO caracteres, com
   reticências; o nome inteiro fica no title e no rótulo acessível. */
export const NOME_MAXIMO = 20;
export function nomeCurto(nome: string): string {
  const limpo = nome.trim();
  return limpo.length > NOME_MAXIMO ? `${limpo.slice(0, NOME_MAXIMO - 1).trimEnd()}…` : limpo;
}
/* Uma imagem transparente de 1×1 para o arrasto não mostrar o bloco cinza. */
let imagemVaziaCache: HTMLImageElement | null = null;
function imagemVazia(): HTMLImageElement {
  if (!imagemVaziaCache) {
    imagemVaziaCache = new Image(1, 1);
    imagemVaziaCache.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  return imagemVaziaCache;
}
/* Evento disparado quando um cartão abre o seu card flutuante; os outros fecham. */
const ABRIU_CARD_FLUTUANTE = "dash:card-flutuante-aberto";

/* A cor da aresta de cima de cada pilar. */
const TOM_COLUNA: Partial<Record<string, string>> = {
  "creative-test": "border-t-[#d8b4fe]",
  "audience-test": "border-t-[#ffffff]",
  "sales-page-test": "border-t-[#67e8f9]",
  "checkout-test": "border-t-[#a3e635]",
  "offer-test": "border-t-[#f9a8d4]",
  "pixel-warmup": "border-t-[#fdba74]",
  "pre-scale": "border-t-[#fde047]",
  scale: "border-t-[#93c5fd]",
  explosive: "border-t-[#fca5a5]",
  unclassified: "border-t-[#6a6a6a]",
  "others-2": "border-t-[#8a8a8a]",
  "others-3": "border-t-[#6a6a6a]",
  "others-4": "border-t-[#8a8a8a]",
  "big-1": "border-t-[#a3a3a3]",
  "big-2": "border-t-[#a3a3a3]",
};

export function ClassBoard({
  tree: suppliedTree,
  regras,
  network,
}: {
  tree: CampaignTree;
  /** O freio de mão da conta: vale ao renomear (a simulação o consulta). */
  regras: ProfitGuardrails;
  /** Quando presente, só as campanhas desta rede — e os cartões novos nascem nela. */
  network?: AdNetwork;
}) {
  const demo = suppliedTree.modo === "demo";
  const sandbox = useCampaignDemo();
  const todas = demo ? sandbox.rows : suppliedTree.campanhas;
  const tree = {
    ...suppliedTree,
    campanhas: network ? todas.filter((c) => c.network === network) : todas,
  };

  /* O cofre local de classes é por rede; uma instância para cada. */
  const classesMeta = useCampaignClasses(tree.modo, "meta");
  const classesGoogle = useCampaignClasses(tree.modo, "google");
  const classesYoutube = useCampaignClasses(tree.modo, "youtube");
  const cofre = { meta: classesMeta, google: classesGoogle, youtube: classesYoutube };

  const [aviso, setAviso] = React.useState<string>("");
  const [arrastando, setArrastando] = React.useState<string | null>(null);
  /* O bloco (ou a célula vazia) por cima do qual uma campanha está sendo arrastada. */
  const [sobre, setSobre] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  /* A ordem dos pilares é do usuário: arrasta o cabeçalho de um pilar para
     onde quiser (ou usa as setas no botão de mover). Fica guardada neste
     navegador. O servidor e a primeira pintura usam a ordem padrão; a
     guardada entra logo depois de montar, para não haver diferença de
     hidratação. */
  const [ordem, setOrdem] = React.useState<string[]>(ORDEM);
  const ordemCarregada = React.useRef(false);
  /* Os blocos do usuário: tamanhos, blocos criados, pilares apagados e
     campanhas ligadas a blocos criados (ver o cofre dos blocos). */
  const cofreDeBlocos = useBoardBlocks();
  const existentes = blocosExistentes(cofreDeBlocos);
  /* A taxa do gateway entra na saúde (lucro) de cada bloco e campanha. */
  const { gatewayPercentual } = useTaxas();
  /* A ordem que se vê: a guardada, sem o que já não existe, e com o que
     ainda não estava nela (um pilar restaurado, um bloco recém-criado)
     no fim. Tudo o que mexe na ordem parte desta lista. */
  const ordemVisivel: string[] = [];
  for (const id of [...ordem, ...existentes]) {
    if (!ordemVisivel.includes(id) && existentes.includes(id)) ordemVisivel.push(id);
  }
  const tamanho = (id: string): Tamanho => tamanhoDoBloco(cofreDeBlocos.blocos, id);
  const rotulo = (id: string): string => rotuloDoBloco(cofreDeBlocos.blocos, id);
  /* As campanhas de cada bloco e os números de cada um (investimento
     somado, ROAS). O quadro desenha-se na ordem do ROAS: quem rende
     mais fica primeiro; os blocos sem investimento vêm depois, na ordem
     do usuário. Os fixos ficam na vaga deles, fora dessa fila. */
  const porBloco = new Map<string, CampaignRow[]>(ordemVisivel.map((id) => [id, []]));
  for (const c of tree.campanhas) porBloco.get(blocoDaCampanha(c))?.push(c);
  const numerosPorBloco = new Map(ordemVisivel.map((id) => [id, numerosDoBloco(porBloco.get(id) ?? [])]));
  const roasDe = (id: string) => numerosPorBloco.get(id)?.roas ?? null;
  const ordemPorRoas = ordenarPorRoas(ordemVisivel, roasDe);
  /* Um bloco com investimento tem lugar dado pelo ROAS: não se arrasta. */
  const ordenadoPeloRoas = (id: string) => roasDe(id) !== null;
  /* O histórico do ROAS de cada bloco (uma leitura a cada cinco minutos)
     alimenta o gráfico ao vivo do painel do bloco. Cada leitura nova, e
     cada volta de cinco minutos, grava a leitura de agora. A chave leva
     a rede da página: o mesmo bloco soma campanhas diferentes em cada. */
  const escopoDoHistorico = network ?? "todas";
  const historico = useRoasHistory();
  const assinaturaDosRoas = ordemVisivel.map((id) => `${id}=${roasDe(id) ?? "-"}`).join(",");
  React.useEffect(() => {
    const gravar = () => {
      for (const par of assinaturaDosRoas.split(",")) {
        const [id, valor] = par.split("=");
        if (id && valor && valor !== "-") registrarRoasDoBloco(chaveDoHistorico(escopoDoHistorico, id), Number(valor));
      }
    };
    gravar();
    const timer = window.setInterval(gravar, INTERVALO_AMOSTRA_MS);
    return () => window.clearInterval(timer);
  }, [assinaturaDosRoas, escopoDoHistorico]);
  /* O histórico do ROAS de cada campanha (uma leitura por minuto)
     alimenta o gráfico do card que abre no megafone. */
  const assinaturaDasCampanhas = tree.campanhas
    .map((c) => `${c.id}=${derivadas(c.metrics).roas ?? "-"}`)
    .join(",");
  React.useEffect(() => {
    const gravar = () => {
      for (const par of assinaturaDasCampanhas.split(",")) {
        const corte = par.lastIndexOf("=");
        const id = corte > 0 ? par.slice(0, corte) : "";
        const valor = corte > 0 ? par.slice(corte + 1) : "";
        if (id && valor && valor !== "-") registrarRoasDaCampanha(chaveDaCampanhaNoHistorico(escopoDoHistorico, id), Number(valor));
      }
    };
    gravar();
    const timer = window.setInterval(gravar, INTERVALO_MINUTO_MS);
    return () => window.clearInterval(timer);
  }, [assinaturaDasCampanhas, escopoDoHistorico]);
  /* A campanha aberta pela seta: os dados dela aparecem embaixo da faixa,
     dentro do bloco (uma de cada vez em todo o quadro). */
  const [campanhaAberta, setCampanhaAberta] = React.useState<string | null>(null);
  /* Com a campanha aberta, a esquerda mostra uma faixa de cada vez: esta.
     Null = a faixa da campanha aberta. Troca-se pelos botões, não a rolar. */
  const [faixaEscolhida, setFaixaEscolhida] = React.useState<number | null>(null);
  /* O painel dos números de um bloco (um de cada vez), preso ao cabeçalho. */
  const [painelDeNumeros, setPainelDeNumeros] = React.useState<{ id: string; ancora: HTMLElement } | null>(null);
  const fecharNumeros = React.useCallback(() => setPainelDeNumeros(null), []);
  /* Quantas faixas cabem por página em cada bloco (a lista mede e avisa). */
  const [capacidades, setCapacidades] = React.useState<Record<string, number>>({});
  const medirBloco = React.useCallback((id: string, porPagina: number) => {
    setCapacidades((antes) => (antes[id] === porPagina ? antes : { ...antes, [id]: porPagina }));
  }, []);
  /* Blocos fixados, cada um na sua vaga ("fileira / coluna"): os seis
     "Outras campanhas" à esquerda por padrão; o alfinete fixa qualquer
     bloco na vaga exata em que ele está, ou solta. Guardado neste
     navegador (o formato antigo, uma lista, ainda é lido). */
  const [fixos, setFixos] = React.useState<Map<string, string>>(fixosPadrao);
  React.useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(FIXOS_KEY);
      const lido = bruto ? (JSON.parse(bruto) as unknown) : null;
      let restaurado: Map<string, string> | null = null;
      if (Array.isArray(lido)) {
        const ids = lido.filter((x): x is PilarId => typeof x === "string" && isPilar(x));
        restaurado = new Map(ids.map((p, i) => [p, vagaFixa(i)]));
      } else if (lido && typeof lido === "object") {
        restaurado = new Map(
          Object.entries(lido as Record<string, unknown>)
            .filter((par): par is [string, string] => ID_BLOCO.test(par[0]) && vagaValida(par[1])),
        );
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura os fixos guardados só depois de montar
      if (restaurado) setFixos(restaurado);
    } catch {
      // Sem storage ou valor inválido: ficam os padrões.
    }
  }, []);
  function guardarFixos(proximo: Map<string, string>) {
    setOrigemDaOrdem("usuario");
    setFixos(proximo);
    try {
      window.localStorage.setItem(FIXOS_KEY, JSON.stringify(Object.fromEntries(proximo)));
    } catch {
      // Sem storage, vale só até recarregar.
    }
  }
  function alternarFixo(pilar: string) {
    const proximo = new Map(fixos);
    if (proximo.has(pilar)) {
      proximo.delete(pilar);
    } else {
      // Fixa na vaga em que o bloco está agora (depois de qualquer troca).
      const vaga = vagasDaGrade(ordemPorRoas, fixos, tamanho).get(pilar);
      if (vaga) proximo.set(pilar, vaga);
    }
    guardarFixos(proximo);
    setAviso(proximo.has(pilar) ? `Bloco "${rotulo(pilar)}" fixado nesta vaga.` : `Bloco "${rotulo(pilar)}" solto: pode ser arrastado.`);
  }
  /* Criar, apagar e redimensionar blocos. Um bloco novo entra no fim da
     ordem (a primeira vaga livre onde cabe); criado a partir de uma
     célula vazia, fica fixado nela. Apagar um bloco também o tira da
     ordem e dos fixos. */
  function criarBloco(vaga?: string): string | null {
    const id = cofreDeBlocos.criar();
    if (!id) { setAviso("Limite de blocos atingido."); return null; }
    guardarOrdem([...ordemVisivel, id]);
    if (vaga) {
      const proximo = new Map(fixos);
      proximo.set(id, vaga);
      guardarFixos(proximo);
    }
    setAviso(`Bloco novo criado${vaga ? " nesta vaga" : ""}.`);
    return id;
  }
  function apagarBloco(id: string) {
    if (ordemVisivel.length <= 1) { setAviso("O quadro precisa de pelo menos um bloco."); return; }
    const nome = rotulo(id);
    cofreDeBlocos.apagar(id);
    guardarOrdem(ordemVisivel.filter((x) => x !== id));
    if (fixos.has(id)) {
      const proximo = new Map(fixos);
      proximo.delete(id);
      guardarFixos(proximo);
    }
    setAviso(isPilar(id) ? `Bloco "${nome}" apagado. As campanhas dele aparecem no primeiro bloco; pode restaurá-lo pelo menu de qualquer bloco.` : `Bloco "${nome}" apagado. As campanhas dele voltaram para a classe delas.`);
  }
  /* Faixas: cada fileira da grade é uma faixa de cinco blocos. "Nova
     faixa" cria cinco blocos fixados numa fileira nova, embaixo de tudo;
     "Apagar faixa" apaga os blocos da fileira do bloco e sobe as fileiras
     fixadas de baixo. */
  function criarFaixa() {
    const fileira = fileirasDaGrade(vagasDaGrade(ordemVisivel, fixos, tamanho), tamanho) + 1;
    const ids: string[] = [];
    for (let coluna = 1; coluna <= GRADE.colunas; coluna++) {
      const id = cofreDeBlocos.criar();
      if (!id) break;
      ids.push(id);
    }
    if (!ids.length) { setAviso("Limite de blocos atingido."); return; }
    const proximo = new Map(fixos);
    ids.forEach((id, i) => proximo.set(id, `${fileira} / ${i + 1}`));
    guardarOrdem([...ordemVisivel, ...ids]);
    guardarFixos(proximo);
    setAviso(`Faixa ${fileira} criada com ${ids.length} blocos.`);
  }
  function apagarFaixa(fileira: number) {
    const vagasAtuais = vagasDaGrade(ordemPorRoas, fixos, tamanho);
    const daFaixa = ordemVisivel.filter((id) => Number(VAGA.exec(vagasAtuais.get(id) ?? "")?.[1]) === fileira);
    if (!daFaixa.length) return;
    if (daFaixa.length >= ordemVisivel.length) { setAviso("O quadro precisa de pelo menos um bloco."); return; }
    for (const id of daFaixa) cofreDeBlocos.apagar(id);
    guardarOrdem(ordemVisivel.filter((id) => !daFaixa.includes(id)));
    const proximo = new Map<string, string>();
    for (const [id, vaga] of fixos) {
      if (daFaixa.includes(id)) continue;
      const m = VAGA.exec(vaga);
      if (!m) continue;
      const linha = Number(m[1]);
      proximo.set(id, linha > fileira ? `${linha - 1} / ${m[2]}` : vaga);
    }
    guardarFixos(proximo);
    setAviso(`Faixa ${fileira} apagada (${daFaixa.length} blocos). Os pilares de fábrica podem ser restaurados pelo menu de qualquer bloco.`);
  }
  function restaurarBloco(pilar: PilarId) {
    cofreDeBlocos.restaurar(pilar);
    guardarOrdem([...ordemVisivel, pilar]);
    setAviso(`Bloco "${pilarLabel(pilar)}" restaurado.`);
  }
  function redimensionarBloco(id: string, novo: Tamanho) {
    setOrigemDaOrdem("usuario");
    cofreDeBlocos.redimensionar(id, novo);
    setAviso(`Bloco "${rotulo(id)}" com ${novo.largura} de largura e ${novo.altura} de altura.`);
  }
  /* Arrastar um bloco reorganiza ao vivo, como os ícones na tela de um
     celular: ao passar por cima de outro bloco, ele já abre espaço (os
     blocos deslizam); soltar só guarda a ordem em que ficou. */
  function ordemComEspaco(atual: string[], origem: string, destino: string): string[] {
    if (origem === destino || fixos.has(destino) || ordenadoPeloRoas(destino)) return atual;
    const i = atual.indexOf(origem);
    const j = atual.indexOf(destino);
    if (i < 0 || j < 0) return atual;
    const sem = atual.filter((x) => x !== origem);
    const alvo = sem.indexOf(destino);
    // Indo para a frente, entra depois do destino; voltando, entra antes.
    const posicao = i < j ? alvo + 1 : alvo;
    return [...sem.slice(0, posicao), origem, ...sem.slice(posicao)];
  }
  function abrirEspaco(origem: string, destino: string) {
    const nova = ordemComEspaco(ordemVisivel, origem, destino);
    if (nova === ordemVisivel) return;
    setOrigemDaOrdem("usuario");
    setOrdem(nova);
  }
  /* A tag de cada bloco pinta a faixa inteira do cabeçalho com o seu neon. */
  const { tagDoBloco } = useBlockTags();
  const [arrastandoPilar, setArrastandoPilar] = React.useState<string | null>(null);
  const [sobrePilar, setSobrePilar] = React.useState<string | null>(null);
  /* A ordem no início do arrasto: soltar só guarda (e avisa) se mudou. */
  const [ordemAoArrastar, setOrdemAoArrastar] = React.useState<string[] | null>(null);
  /* Sobre que bloco o cursor está pousado, e desde quando. */
  const pousoRef = React.useRef<{ pilar: string; desde: number } | null>(null);
  function terminarArrasto(destino?: string) {
    if (arrastandoPilar && ordemAoArrastar) {
      let final = ordemVisivel;
      // Soltou rápido, sem pousar sobre o bloco: aplica a troca no destino agora.
      if (destino && ordemAoArrastar.join(",") === ordemVisivel.join(",")) final = ordemComEspaco(ordemVisivel, arrastandoPilar, destino);
      if (final.join(",") !== ordemAoArrastar.join(",")) {
        guardarOrdem(final);
        setAviso(`Bloco "${rotulo(arrastandoPilar)}" movido. Ordem salva neste navegador.`);
      }
    }
    setArrastandoPilar(null);
    setSobrePilar(null);
    setOrdemAoArrastar(null);
    pousoRef.current = null;
  }
  /* Mover um bloco (arrasto, setas, fixar/soltar) anima: cada bloco
     desliza da posição antiga para a nova (FLIP), em vez de pular. Só
     quando a mudança veio de uma ação do usuário — a ordem e os fixos
     guardados, que entram ao abrir a página, não animam. */
  const [origemDaOrdem, setOrigemDaOrdem] = React.useState<"guardado" | "usuario">("guardado");
  /* Dados novos depois de montar (sincronização ao vivo, simulação) mudam
     o ROAS e a ordem: a troca de lugar anima como se fosse do usuário. */
  const primeirosDados = React.useRef(true);
  React.useEffect(() => {
    if (primeirosDados.current) {
      primeirosDados.current = false;
      return;
    }
    setOrigemDaOrdem("usuario");
  }, [todas]);
  const posicoesAntes = React.useRef(new Map<string, DOMRect>());
  /* Tudo o que muda o desenho da grade: a ordem visível e o tamanho de
     cada bloco (criar, apagar, restaurar e redimensionar entram aqui). */
  const chaveDaGrade = ordemPorRoas.map((id) => `${id}:${tamanho(id).largura}x${tamanho(id).altura}`).join(",");
  React.useLayoutEffect(() => {
    const quadro = quadroRef.current;
    if (!quadro) return;
    const blocos = [...quadro.querySelectorAll<HTMLElement>(".class-board-pilares > [data-pilar]")];
    const antes = posicoesAntes.current;
    const depois = new Map<string, DOMRect>();
    const reduzido = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animar = origemDaOrdem === "usuario" && antes.size > 0;
    for (const bloco of blocos) {
      const chave = bloco.dataset.pilar ?? "";
      /* Se o bloco ainda está deslizando de uma troca anterior, a nova
         animação parte de onde ele está agora na tela (não do destino
         antigo): arrastar por vários blocos seguidos fica fluido, sem
         pulos. O retângulo lido antes de cancelar inclui o deslocamento. */
      const emVoo = typeof bloco.getAnimations === "function" ? bloco.getAnimations() : [];
      const visual = emVoo.length ? bloco.getBoundingClientRect() : null;
      for (const anim of emVoo) anim.cancel();
      const agora = bloco.getBoundingClientRect();
      depois.set(chave, agora);
      const antiga = visual ?? antes.get(chave);
      if (!animar || reduzido || !antiga || typeof bloco.animate !== "function") continue;
      const dx = antiga.left - agora.left;
      const dy = antiga.top - agora.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      bloco.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 360, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
    posicoesAntes.current = depois;
  }, [chaveDaGrade, fixos, origemDaOrdem]);
  React.useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(ORDEM_PILARES_KEY);
      const lida = bruto ? (JSON.parse(bruto) as unknown) : null;
      if (Array.isArray(lida)) {
        // Só ids com cara de bloco; o que não existir é ignorado ao desenhar.
        const valida = lida.filter((x): x is string => typeof x === "string" && ID_BLOCO.test(x));
        const completa = [...new Set([...valida, ...ORDEM])];
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura a ordem guardada só depois de montar
        setOrdem(completa);
      }
    } catch {
      // Sem storage ou com valor inválido: fica a ordem padrão.
    }
    ordemCarregada.current = true;
  }, []);
  function guardarOrdem(nova: string[]) {
    setOrigemDaOrdem("usuario");
    setOrdem(nova);
    try {
      window.localStorage.setItem(ORDEM_PILARES_KEY, JSON.stringify(nova));
    } catch {
      // Sem storage, a ordem vale só até recarregar.
    }
  }
  /* As setas trocam o bloco com o vizinho entre os blocos soltos (sem
     investimento e sem alfinete): só entre esses a ordem do usuário vale. */
  function moverPilar(classe: string, passo: -1 | 1) {
    const soltos = ordemVisivel.filter((id) => !fixos.has(id) && !ordenadoPeloRoas(id));
    const i = soltos.indexOf(classe);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= soltos.length) return;
    const trocados = [...soltos];
    [trocados[i], trocados[j]] = [trocados[j], trocados[i]];
    let k = 0;
    const nova = ordemVisivel.map((id) => (soltos.includes(id) ? trocados[k++] : id));
    guardarOrdem(nova);
    setAviso(`Pilar "${rotulo(classe)}" movido para a posição ${j + 1} de ${soltos.length}. Ordem salva neste navegador.`);
  }

  React.useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  function classeDe(c: CampaignRow): CampaignClassId {
    return demo ? cofre[c.network].resolve(c) : (isCampaignClass(c.campaignClass) ? c.campaignClass : cofre[c.network].resolve(c));
  }

  function moverPorId(id: string, nome: string, rede: AdNetwork, destino: CampaignClassId) {
    if (demo || id.startsWith("demo-")) {
      cofre[rede].assign(id, destino);
      setAviso(`"${nome}" foi para ${campaignClassLabel(destino)}. Salvo neste navegador; nenhuma rede foi alterada.`);
      return;
    }
    startTransition(async () => {
      const r = await setCampaignClassAction(id, destino);
      setAviso(r.ok ? `"${nome}" foi para ${campaignClassLabel(destino)}.` : r.mensagem);
    });
  }
  function mover(c: CampaignRow, destino: CampaignClassId) {
    if (classeDe(c) === destino) return;
    moverPorId(c.id, c.name, c.network, destino);
  }
  /* Em que bloco a campanha aparece: no bloco criado a que foi ligada,
     se ainda existir; senão no bloco da classe dela; se esse foi
     apagado, no primeiro bloco do quadro. */
  function chaveDe(c: CampaignRow) {
    return chaveDaCampanha(tree.modo, c.network, c.id);
  }
  function blocoDaCampanha(c: CampaignRow): string {
    const ligado = cofreDeBlocos.campanhas[chaveDe(c)];
    if (ligado && existentes.includes(ligado)) return ligado;
    const pilar = pilarDaClasse(classeDe(c));
    if (existentes.includes(pilar)) return pilar;
    return ordemVisivel[0] ?? pilar;
  }
  /* Soltar uma campanha num bloco: num bloco de fábrica, ela recebe a
     classe do bloco (e deixa de estar ligada a um bloco criado); num
     bloco criado, fica ligada a ele e a classe não muda. */
  function soltarCampanha(c: CampaignRow, bloco: string) {
    if (blocoDaCampanha(c) === bloco) return;
    if (isBlocoPersonalizado(bloco)) {
      cofreDeBlocos.colocar(chaveDe(c), bloco);
      setAviso(`"${c.name}" foi para o bloco ${rotulo(bloco)}. Salvo neste navegador; a classe não mudou.`);
      return;
    }
    cofreDeBlocos.colocar(chaveDe(c), null);
    if (isPilar(bloco)) {
      if (classeDe(c) === bloco) setAviso(`"${c.name}" voltou para ${campaignClassLabel(bloco)}.`);
      else mover(c, bloco);
    }
  }
  /* Renomear a campanha pelo painel dela: na demonstração, na simulação
     local; com banco, na campanha real. Devolve a mensagem de erro, ou
     nada quando deu certo. */
  async function renomear(c: CampaignRow, nome: string): Promise<string | null> {
    const limpo = nome.trim().slice(0, 200);
    if (!limpo) return "O nome não pode ficar vazio.";
    if (limpo === c.name) return null;
    const form = new FormData();
    form.set("tipo", "campaign");
    form.set("id", c.id);
    form.set("name", limpo);
    form.set("status", c.status);
    const resultado = demo || c.id.startsWith("demo-")
      ? await sandbox.update(regras)(null, form)
      : await updateAdEntityAction(null, form);
    if (!resultado.ok) return resultado.mensagem;
    setAviso(`Campanha renomeada para "${limpo}".`);
    return null;
  }

  /* O quadro cabe numa tela: mede onde começa e ocupa até o fim da
     janela, sem rolar a página. Os pilares dividem essa altura; cada um
     rola por dentro se tiver mais cartões do que cabe. */
  const quadroRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = quadroRef.current;
    if (!el) return;
    let remedir: number | null = null;
    const ajustar = () => {
      // O menu do topo, quando aberto, empurra o quadro para baixo sem
      // encolhê-lo: a altura medida com o menu fechado fica como está.
      const painel = document.querySelector<HTMLElement>(".board-pager-sidebar");
      if (el.style.getPropertyValue("--quadro-altura") && painel?.dataset.open === "true") return;
      // Menu fechado mas ainda recolhendo (animação): mede agora e de novo
      // quando ele terminar, senão o quadro fica com a altura do meio da
      // animação e as fileiras encolhem.
      if (painel && painel.dataset.open !== "true" && painel.getBoundingClientRect().height > 0) {
        if (remedir) window.clearTimeout(remedir);
        remedir = window.setTimeout(ajustar, 340);
      }
      const topo = el.getBoundingClientRect().top + window.scrollY;
      // O respiro embaixo é a soma dos espaçamentos inferiores dos
      // contêineres até o body — medido, não adivinhado.
      let fundo = 0;
      for (let pai = el.parentElement; pai && pai !== document.body; pai = pai.parentElement) {
        const cs = getComputedStyle(pai);
        fundo += (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0) + (parseFloat(cs.marginBottom) || 0);
      }
      let altura = Math.max(360, window.innerHeight - topo - fundo);
      el.style.setProperty("--quadro-altura", `${altura}px`);
      // Um pequeno estouro que ainda sobre é descontado; um estouro grande
      // vem de outra coisa (o próprio conteúdo maior que a tela, um
      // elemento estranho) e não pode esmagar o quadro.
      const sobra = document.documentElement.scrollHeight - window.innerHeight;
      if (sobra > 0 && sobra <= 48 && altura - sobra >= 360) {
        altura -= sobra;
        el.style.setProperty("--quadro-altura", `${altura}px`);
      }
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(ajustar);
    ro?.observe(document.body);
    // Abrir ou fechar o menu do topo também remede (o body pode nem mudar de tamanho).
    const painel = document.querySelector(".board-pager-sidebar");
    const mo = painel ? new MutationObserver(ajustar) : null;
    if (painel) mo?.observe(painel, { attributes: true, attributeFilter: ["data-open"] });
    return () => {
      window.removeEventListener("resize", ajustar);
      ro?.disconnect();
      mo?.disconnect();
      if (remedir) window.clearTimeout(remedir);
    };
  }, []);

  /* Onde cada bloco começa e quantas células ocupa (ver vagasDaGrade):
     os fixos na vaga marcada, os outros na ordem do ROAS (e, sem
     investimento, na do usuário), na primeira vaga livre onde cabem. A
     grade ganha fileiras se for preciso; as células que sobram viram um
     "+" para criar um bloco ali. */
  const vagas = vagasDaGrade(ordemPorRoas, fixos, tamanho);
  const fileiras = fileirasDaGrade(vagas, tamanho);
  const livres = celulasLivres(vagas, tamanho, fileiras);
  /* Os pilares de fábrica apagados, que qualquer bloco pode restaurar. */
  const restauraveis = PILARES.filter((p) => cofreDeBlocos.removidos.includes(p.id));
  /* A campanha aberta pela seta e a faixa em que ela está: o painel com
     os dados dela entra entre essa faixa e a de baixo, na largura toda. */
  const campanha = campanhaAberta ? tree.campanhas.find((c) => c.id === campanhaAberta) ?? null : null;
  const blocoDaAberta = campanha ? blocoDaCampanha(campanha) : null;
  const faixaAberta = blocoDaAberta ? Number(VAGA.exec(vagas.get(blocoDaAberta) ?? "")?.[1]) || null : null;
  /* O bloco da campanha abre à direita, com a largura de três blocos e a
     altura de três; as faixas passam a ter dois blocos de largura, à
     esquerda, e rolam para mostrar as de baixo. */
  const vagaDoPainel = vagaDoPainelDaCampanha(fileiras);
  /* Com a campanha aberta, a esquerda mostra uma faixa inteira de cada vez
     — sem rolagem: a faixa escolhida nos botões ou, enquanto ninguém
     escolheu, a faixa da campanha aberta. */
  const faixaSozinha = campanha ? Math.min(Math.max(faixaEscolhida ?? faixaAberta ?? 1, 1), fileiras) : null;
  const daFaixaSozinha = (vaga: string | undefined) =>
    faixaSozinha === null || Number(VAGA.exec(vaga ?? "")?.[1]) === faixaSozinha;

  function barraDaFaixa(f: number) {
            const naFaixa = ordemVisivel.filter((id) => Number(VAGA.exec(vagas.get(id) ?? "")?.[1]) === f).length;
            const vagaLivre = livres.find((v) => Number(VAGA.exec(v)?.[1]) === f) ?? null;
            const livresNaFaixa = livres.filter((v) => Number(VAGA.exec(v)?.[1]) === f).length;
            return (
              <div
                key={`faixa-${f}`}
                className="class-board-faixa-barra"
                role="group"
                aria-label={`Faixa ${f}`}
                data-faixa={f}
                data-blocos={naFaixa}
                style={{ gridRow: linhaDosBlocos(f) - 1, gridColumn: "1 / -1", order: f * 10 }}
              >
                <span className="class-board-faixa-nome">Faixa {f}</span>
                <span className="class-board-faixa-conta">
                  {naFaixa} {naFaixa === 1 ? "bloco" : "blocos"}
                  {livresNaFaixa > 0 ? ` · ${livresNaFaixa} ${livresNaFaixa === 1 ? "vaga livre" : "vagas livres"}` : ""}
                </span>
                <button
                  type="button"
                  className="class-board-faixa-acao"
                  aria-label={`Adicionar bloco à faixa ${f}`}
                  title={vagaLivre ? "Cria um bloco na primeira vaga livre desta faixa" : "Faixa cheia: apague um bloco para abrir vaga"}
                  disabled={!vagaLivre}
                  onClick={() => { if (vagaLivre) criarBloco(vagaLivre); }}
                >
                  <Plus aria-hidden="true" />
                  Bloco
                </button>
                <button
                  type="button"
                  className="class-board-faixa-acao class-board-faixa-apagar"
                  aria-label={`Apagar faixa ${f}`}
                  title={naFaixa ? `Apaga os ${naFaixa} blocos desta faixa; as faixas de baixo sobem` : "Faixa vazia"}
                  disabled={!naFaixa}
                  onClick={() => apagarFaixa(f)}
                >
                  Apagar faixa
                </button>
              </div>
            );
  }
  function blocoDoQuadro(pilar: string) {
            const classe = pilar;
            /* Um bloco, uma lista: o pilar de criativos junta vídeo, imagem
               e "sem especificação" sem abas. Soltar um cartão no bloco
               dá-lhe a classe do próprio pilar (ou liga-o ao bloco criado). */
            const cartoes = porBloco.get(pilar) ?? [];
            const fixo = fixos.has(pilar);
            const tag = tagDoBloco(pilar);
            const nome = rotulo(pilar);
            const medida = tamanho(pilar);
            const vaga = vagas.get(pilar);
            const numeros = numerosPorBloco.get(pilar) ?? numerosDoBloco(cartoes);
            /* Com investimento, o lugar é dado pelo ROAS: sem alça de arrasto. */
            const automatico = numeros.roas !== null;
            const preso = fixo || automatico;
            return (
              <section
                key={pilar}
                aria-label={nome}
                data-pilar={pilar}
                data-roas={numeros.estado}
                data-pilar-ordenado={automatico ? "true" : undefined}
                data-largura={medida.largura}
                data-altura={medida.altura}
                style={vaga ? { gridArea: areaComFaixas(vaga, medida), order: ordemNaFaixa(vaga) } : undefined}
                data-vaga={vaga}
                data-area={vaga ? areaDaGrade(vaga, medida) : undefined}
                data-drop-active={sobre === classe || undefined}
                data-pilar-fixo={fixo ? "true" : undefined}
                data-pilar-sobre={sobrePilar === classe && arrastandoPilar !== classe ? "true" : undefined}
                data-pilar-arrastando={arrastandoPilar === classe ? "true" : undefined}
                onDragOver={(e) => {
                  if (arrastandoPilar) {
                    if (preso) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    /* Um bloco que ainda está deslizando por baixo do cursor
                       não vale como destino (senão a troca dispara de novo e
                       fica pulando); e só troca depois de o cursor parar um
                       instante sobre o mesmo bloco, como no celular. */
                    const emVoo = typeof e.currentTarget.getAnimations === "function" && e.currentTarget.getAnimations().length > 0;
                    if (emVoo || classe === arrastandoPilar) return;
                    const agora = e.timeStamp;
                    if (pousoRef.current?.pilar !== classe) {
                      pousoRef.current = { pilar: classe, desde: agora };
                      return;
                    }
                    if (agora - pousoRef.current.desde < 120) return;
                    if (sobrePilar !== classe) {
                      setSobrePilar(classe);
                      abrirEspaco(arrastandoPilar, classe);
                    }
                    return;
                  }
                  if (arrastando) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setSobre(classe); }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setSobre(null);
                  setSobrePilar(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastandoPilar) {
                    // A ordem já mudou ao vivo durante o arrasto; aqui só guarda
                    // (ou aplica a troca, se soltou sem pousar).
                    terminarArrasto(preso ? undefined : classe);
                    return;
                  }
                  const c = tree.campanhas.find((x) => x.id === arrastando);
                  setArrastando(null);
                  setSobre(null);
                  if (c) soltarCampanha(c, classe);
                }}
                className={cn(
                  "class-board-pilar bg-card flex min-w-0 flex-col rounded-none border border-t-4",
                  TOM_COLUNA[classe] ?? "border-t-[#8a8a8a]",
                  sobre === classe && "ring-foreground/40 ring-2",
                )}
              >
                {/* Cabeçalho mínimo, sem título: alfinete, a tag do bloco (só
                    um ícone enquanto não houver tag) e a contagem. O cabeçalho
                    inteiro é a alça: arraste-o para mover o bloco (setas ← e →
                    pelo teclado). */}
                <header
                  className={cn("class-board-pilar-cabecalho flex items-center gap-2 px-2.5 py-2", !preso && "class-board-pilar-alca")}
                  data-tag={tag ? "true" : undefined}
                  style={tag ? { ["--tag-neon" as string]: corDaTag(tag.cor) } : undefined}
                  draggable={!preso}
                  tabIndex={preso ? undefined : 0}
                  title={fixo ? `${nome} · bloco fixado nesta vaga` : automatico ? `${nome} · lugar dado pelo ROAS (do maior para o menor)` : "Arraste para mover o bloco; setas ← e → pelo teclado"}
                  onDragStart={(e) => {
                    if (preso) { e.preventDefault(); return; }
                    e.dataTransfer.setData("application/x-pilar", classe);
                    e.dataTransfer.effectAllowed = "move";
                    // Sem a imagem cinza do navegador: o próprio bloco desliza
                    // para a vaga nova ao vivo; nada de "fantasma".
                    if (typeof e.dataTransfer.setDragImage === "function") e.dataTransfer.setDragImage(imagemVazia(), 0, 0);
                    setArrastandoPilar(classe);
                    setOrdemAoArrastar(ordemVisivel);
                  }}
                  onDragEnd={() => terminarArrasto()}
                  onKeyDown={(e) => {
                    if (preso || e.target !== e.currentTarget) return;
                    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); moverPilar(classe, -1); }
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); moverPilar(classe, 1); }
                  }}
                >
                  <button
                    type="button"
                    className="class-board-pilar-fixo grid size-7 shrink-0 place-items-center"
                    data-fixo={fixo ? "true" : "false"}
                    aria-pressed={fixo}
                    aria-label={fixo ? `Desafixar bloco ${nome}` : `Fixar bloco ${nome}`}
                    title={fixo ? "Fixado nesta vaga. Clique para soltar." : "Clique para fixar nesta vaga."}
                    onClick={() => alternarFixo(pilar)}
                    onPointerDown={(e) => e.stopPropagation()}
                    draggable={false}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <Pin className="size-3.5" />
                  </button>
                  <TituloDoBloco
                    pilar={pilar}
                    rotulo={nome}
                    extra={(fechar) => (
                      <MenuDoBloco
                        rotulo={nome}
                        tamanho={medida}
                        podeApagar={ordemVisivel.length > 1}
                        restauraveis={restauraveis}
                        aoRedimensionar={(novo) => redimensionarBloco(pilar, novo)}
                        aoCriar={() => { criarBloco(); fechar(); }}
                        aoApagar={() => { apagarBloco(pilar); fechar(); }}
                        faixa={Number(VAGA.exec(vaga ?? "")?.[1]) || 1}
                        aoCriarFaixa={() => { criarFaixa(); fechar(); }}
                        aoApagarFaixa={(f) => { apagarFaixa(f); fechar(); }}
                        aoRestaurar={(id) => { restaurarBloco(id); fechar(); }}
                      />
                    )}
                  />
                  {/* O semáforo do bloco: a soma das campanhas (lucro, empate ou
                      prejuízo, com o gateway). Só quando há investimento; o
                      investimento e o ROAS ficam no rótulo e no painel. */}
                  {numeros.estado !== "sem" && numeros.roas !== null && (
                    <button
                      type="button"
                      className="class-board-pilar-numeros"
                      data-roas={numeros.estado}
                      data-saude={saudeDoConjunto(cartoes.map((c) => c.metrics), gatewayPercentual)}
                      aria-label={`Números do bloco ${nome}: investimento ${formatCurrency(numeros.investimentoCents / 100)}, receita ${formatCurrency(numeros.receitaCents / 100)}, ROAS ${formatRatio(numeros.roas)}, ${ROTULO_DO_ROAS[numeros.estado]}, ${ROTULO_DA_SAUDE[saudeDoConjunto(cartoes.map((c) => c.metrics), gatewayPercentual)]}`}
                      aria-expanded={painelDeNumeros?.id === pilar}
                      aria-haspopup="dialog"
                      title={`Investimento ${formatCurrency(numeros.investimentoCents / 100)} · Receita ${formatCurrency(numeros.receitaCents / 100)} · ROAS ${formatRatio(numeros.roas)} (${ROTULO_DO_ROAS[numeros.estado]}). Semáforo: verde = lucro, laranja = empate (±5% do investimento), vermelha = prejuízo, com a taxa do gateway (${gatewayPercentual}%). Clique para ver todas as métricas e o gráfico.`}
                      draggable={false}
                      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        const cabecalho = e.currentTarget.closest<HTMLElement>("header") ?? e.currentTarget;
                        setPainelDeNumeros((atual) => (atual?.id === pilar ? null : { id: pilar, ancora: cabecalho }));
                      }}
                    >
                      <Semaforo saude={saudeDoConjunto(cartoes.map((c) => c.metrics), gatewayPercentual)} rotulo={`Saúde do bloco ${nome}`} />
                    </button>
                  )}
                  <span className="class-board-pilar-contagem bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums">{cartoes.length}</span>
                </header>
                <div className="class-board-pilar-corpo flex flex-1 flex-col gap-2 px-2 pb-2">
                  <ListaPaginada
                    rotulo={nome}
                    itens={cartoes}
                    render={(c) => (
                      <Cartao
                        key={c.id}
                        campanha={c}
                        escopo={escopoDoHistorico}
                        aberto={campanhaAberta === c.id}
                        aoAbrir={() => {
                          setFaixaEscolhida(null);
                          setCampanhaAberta((atual) => (atual === c.id ? null : c.id));
                        }}
                        aoArrastar={(ativo) => { setArrastando(ativo ? c.id : null); if (!ativo) setSobre(null); }}
                        aoRenomear={(nome) => renomear(c, nome)}
                      />
                    )}
                    vazio={null}
                    aoMedir={(n) => medirBloco(pilar, n)}
                  />
                </div>
              </section>
            );
  }
  function vagaLivreDoQuadro(vaga: string) {
    return (
            <button
              key={vaga}
              type="button"
              className="class-board-vaga-livre"
              style={{ gridArea: areaComFaixas(vaga, UM), order: ordemNaFaixa(vaga) }}
              data-vaga={vaga}
              aria-label={`Novo bloco na vaga ${vaga.replace(" / ", ", ")}`}
              title="Criar um bloco aqui"
              data-drop-active={sobre === vaga || undefined}
              onClick={() => criarBloco(vaga)}
              onDragOver={(e) => {
                if (!arrastando) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setSobre(vaga);
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={(e) => {
                e.preventDefault();
                const c = tree.campanhas.find((x) => x.id === arrastando);
                setArrastando(null);
                setSobre(null);
                if (!c) return;
                const id = criarBloco(vaga);
                if (id) cofreDeBlocos.colocar(chaveDe(c), id);
              }}
            >
              <Plus aria-hidden="true" />
            </button>
    );
  }

  return (
    <div ref={quadroRef} className="class-board-quadro" data-campanha-aberta={campanha ? "true" : undefined}>
      {/* O aviso de "bloco movido / campanha movida" fica só para leitores
          de tela: nada aparece no topo da página. */}
      {aviso && (
        <p role="status" className="sr-only">
          {aviso}
        </p>
      )}
      {/* Com banco, os números (e a ordem pelo ROAS) atualizam sozinhos. */}
      {!demo && <QuadroAoVivo metaConectado={suppliedTree.metaConectado} />}
      {/* Os blocos dividem a seção em cinco colunas iguais e fileiras
          iguais — sem rolagem lateral e sem nada cortado. Em telas
          estreitas a grade vira 2 ou 1 por linha, com altura natural. */}
      <div
        className="class-board-pilares"
        role="region"
        aria-label="Quadro de classes"
        data-colunas={GRADE.colunas}
        data-fileiras={fileiras}
        data-campanha-aberta={campanha ? campanha.id : undefined}
        style={{ ["--fileiras" as string]: fileiras }}
      >
          {/* A barra de cada faixa: o nome, quantos blocos tem, "+ Bloco"
              (entra na primeira vaga livre da faixa) e "Apagar faixa". */}
          {/* A ordem de leitura segue o ROAS; o `order` só vale quando a
              grade vira duas colunas, para cada faixa ficar com os seus. */}
          {/* Com a campanha aberta só a faixa escolhida fica na seção: ela
              cabe inteira, sem rolagem — os botões trocam de faixa. */}
          {Array.from({ length: fileiras }, (_, i) => i + 1)
            .filter((f) => faixaSozinha === null || f === faixaSozinha)
            .map((f) => barraDaFaixa(f))}
          {ordemPorRoas.filter((pilar) => daFaixaSozinha(vagas.get(pilar))).map((pilar) => blocoDoQuadro(pilar))}
          {livres.filter((vaga) => daFaixaSozinha(vaga)).map((vaga) => vagaLivreDoQuadro(vaga))}
          {/* Cada célula vazia da grade é um "+": cria um bloco novo ali
              (fixado nessa vaga). Também aceita uma campanha solta: vira
              um bloco novo já com ela dentro. */}
          {painelDeNumeros && (
            <PainelDoBloco
              ancora={painelDeNumeros.ancora}
              rotulo={rotulo(painelDeNumeros.id)}
              campanhas={porBloco.get(painelDeNumeros.id) ?? []}
              amostras={historico.historicoDe(chaveDoHistorico(escopoDoHistorico, painelDeNumeros.id))}
              porPagina={capacidades[painelDeNumeros.id]}
              onClose={fecharNumeros}
            />
          )}
      </div>
      {/* Os botões que trocam de faixa: a seta para a de cima, o número de
          cada faixa e a seta para a de baixo. Substituem a rolagem. */}
      {faixaSozinha !== null && (
        <nav className="class-board-faixa-pager" aria-label="Trocar de faixa">
          <button
            type="button"
            className="class-board-faixa-passo"
            aria-label="Faixa anterior"
            title="Mostra a faixa de cima"
            disabled={faixaSozinha <= 1}
            onClick={() => setFaixaEscolhida(faixaSozinha - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <ul className="class-board-faixa-numeros">
            {Array.from({ length: fileiras }, (_, i) => i + 1).map((f) => (
              <li key={f}>
                <button
                  type="button"
                  aria-label={`Mostrar a faixa ${f}`}
                  aria-current={f === faixaSozinha ? "true" : undefined}
                  data-atual={f === faixaSozinha ? "true" : undefined}
                  onClick={() => setFaixaEscolhida(f)}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="class-board-faixa-passo"
            aria-label="Próxima faixa"
            title="Mostra a faixa de baixo"
            disabled={faixaSozinha >= fileiras}
            onClick={() => setFaixaEscolhida(faixaSozinha + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
      {/* A campanha aberta: um bloco com a largura de três blocos e a
          altura de três, à direita; as faixas ficam à esquerda, com dois
          blocos de largura, e rolam. */}
      {campanha && (
        <DadosDaCampanha
          campanha={campanha}
          escopo={escopoDoHistorico}
          gateway={gatewayPercentual}
          href={`/campanhas/campanha/${encodeURIComponent(campanha.id)}${tree.modo === "banco" ? "?modo=real" : ""}`}
          faixa={faixaAberta ?? 1}
          bloco={blocoDaAberta ? rotulo(blocoDaAberta) : ""}
          vaga={vagaDoPainel}
          onClose={() => {
            setFaixaEscolhida(null);
            setCampanhaAberta(null);
          }}
        />
      )}
      {/* Uma faixa nova, com cinco blocos, embaixo de tudo. */}
      <button
        type="button"
        className="class-board-nova-faixa"
        aria-label="Criar nova faixa com 5 blocos"
        title="Cria a faixa seguinte com cinco blocos fixados"
        onClick={criarFaixa}
      >
        <Plus aria-hidden="true" />
        Nova faixa
      </button>
    </div>
  );
}

/*
  O menu do bloco, dentro do painel das tags: a largura e a altura do
  bloco em células da grade (com − e +), um bloco novo, apagar este e
  restaurar os blocos de fábrica apagados.
*/
/* Todos os dados de uma campanha, embaixo da faixa dela: o gráfico do
   ROAS por minuto, o lucro com a taxa do gateway, as métricas da
   plataforma e as derivadas, o estado, o orçamento, a rede, o objetivo e
   a última sincronização — e o atalho para a página inteira. */
function DadosDaCampanha({
  campanha: c,
  escopo,
  gateway,
  href,
  faixa,
  bloco,
  vaga,
  onClose,
}: {
  campanha: CampaignRow;
  escopo: string;
  gateway: number;
  href: string;
  /** A faixa em que o bloco da campanha está (o painel entra logo abaixo). */
  faixa: number;
  /** O nome do bloco que guarda a campanha. */
  bloco: string;
  /** O tamanho do bloco da campanha, em blocos (três por três). */
  vaga: { largura: number; altura: number };
  onClose: () => void;
}) {
  const historico = useCampaignRoasHistory();
  const amostras = historico.historicoDe(chaveDaCampanhaNoHistorico(escopo, c.id));
  const d = derivadas(c.metrics);
  const lucro = lucroDaCampanha(c.metrics, gateway);
  const dinheiro = (v: number) => formatCurrency(v / 100, Math.abs(v) < 10_000 ? 2 : 0);
  const dinheiroOuTraco = (v: number | null) => (v === null ? "—" : dinheiro(v));
  const comSinal = (v: number) => (v < 0 ? `−${dinheiro(-v)}` : dinheiro(v));
  const saude = saudeDasMetricas(c.metrics, gateway);
  const numeros: [string, string][] = [
    ["Investimento", dinheiro(c.metrics.spendCents)],
    ["Retorno", dinheiro(c.metrics.revenueCents)],
    ["ROAS", d.roas === null ? "—" : formatRatio(d.roas)],
    ["Margem", d.margem === null ? "—" : formatPercent(d.margem, 1)],
    ["Compras", formatInteger(c.metrics.purchases)],
    ["CPA", dinheiroOuTraco(d.cpaCents)],
    ["Impressões", formatInteger(c.metrics.impressions)],
    ["Cliques", formatInteger(c.metrics.clicks)],
    ["CTR", d.ctr === null ? "—" : formatPercent(d.ctr, 2)],
    ["CPC", dinheiroOuTraco(d.cpcCents)],
    ["CPM", dinheiroOuTraco(d.cpmCents)],
    ["Orçamento diário", c.dailyBudgetCents === null ? "—" : dinheiro(c.dailyBudgetCents)],
  ];
  const fichas: [string, string][] = [
    ["Estado", STATUS_LABEL[c.status]],
    ["Rede", NETWORK_MANAGERS[c.network].label],
    ["Objetivo", c.objective ?? "—"],
    ["Conjuntos", formatInteger(c.adSets.length)],
    ["Origem", c.source === "demo" ? "Demonstração" : c.source === "meta" ? "Meta" : "Manual"],
    ["Sincronizada", c.syncedAt ? new Date(c.syncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"],
  ];
  return (
    <div
      className="class-board-dados"
      role="group"
      aria-label={`Dados de ${c.name}`}
      data-faixa={faixa}
      data-largura={vaga.largura}
      data-altura={vaga.altura}
    >
      <div className="class-board-dados-topo">
        <b className="class-board-dados-nome">{c.name}</b>
        <span className="class-board-dados-onde">Faixa {faixa} · {bloco}</span>
        <Semaforo saude={saude} rotulo={`Saúde de ${c.name}`} />
        <Link href={href} className="class-board-dados-pagina">Abrir a página</Link>
        <button type="button" className="class-board-dados-fechar" aria-label={`Fechar dados de ${c.name}`} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <GraficoRoas amostras={amostras} rotulo={c.name} janelas={JANELAS_MINUTO} intervaloMs={INTERVALO_MINUTO_MS} cadencia="1 minuto" compacto />
      <div className="class-board-dados-coluna">
      <p className="class-board-dados-lucro" data-lucro={lucro.lucroCents < 0 ? "negativo" : lucro.lucroCents > 0 ? "positivo" : "zero"}>
        <span>Lucro</span>
        <b>{comSinal(lucro.lucroCents)}</b>
        <small>retorno − gateway {gateway}% ({dinheiro(lucro.gatewayCents)}) − tráfego · {ROTULO_DA_SAUDE[saude]}</small>
      </p>
      <dl className="class-board-dados-numeros">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      </div>
      <dl className="class-board-dados-fichas">
        {fichas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MenuDoBloco({
  rotulo,
  tamanho,
  podeApagar,
  restauraveis,
  aoRedimensionar,
  aoCriar,
  aoApagar,
  aoRestaurar,
  faixa,
  aoCriarFaixa,
  aoApagarFaixa,
}: {
  rotulo: string;
  tamanho: Tamanho;
  podeApagar: boolean;
  restauraveis: readonly { id: PilarId; label: string }[];
  aoRedimensionar: (novo: Tamanho) => void;
  aoCriar: () => void;
  aoApagar: () => void;
  aoRestaurar: (id: PilarId) => void;
  /** A faixa (fileira da grade) em que o bloco está. */
  faixa: number;
  aoCriarFaixa: () => void;
  aoApagarFaixa: (faixa: number) => void;
}) {
  const passo = (campo: keyof Tamanho, delta: -1 | 1) => aoRedimensionar({ ...tamanho, [campo]: tamanho[campo] + delta });
  /* A lista de blocos apagados fica recolhida: um botão a abre. */
  const [restaurarAberto, setRestaurarAberto] = React.useState(false);
  return (
    <div className="class-board-bloco-secao class-board-menu-secao" role="group" aria-label={`Bloco ${rotulo}`}>
      <div className="class-board-bloco-tamanho class-board-menu-linha class-board-menu-linha-2">
        <div className="class-board-bloco-passo" role="group" aria-label="Largura do bloco">
          <button type="button" aria-label="Menos largo" disabled={tamanho.largura <= 1} onClick={() => passo("largura", -1)}>−</button>
          <span>Largura · {tamanho.largura}</span>
          <button type="button" aria-label="Mais largo" disabled={tamanho.largura >= LARGURA_MAXIMA} onClick={() => passo("largura", 1)}>+</button>
        </div>
        <div className="class-board-bloco-passo" role="group" aria-label="Altura do bloco">
          <button type="button" aria-label="Menos alto" disabled={tamanho.altura <= 1} onClick={() => passo("altura", -1)}>−</button>
          <span>Altura · {tamanho.altura}</span>
          <button type="button" aria-label="Mais alto" disabled={tamanho.altura >= ALTURA_MAXIMA} onClick={() => passo("altura", 1)}>+</button>
        </div>
      </div>
      <div className="class-board-bloco-acoes class-board-menu-linha class-board-menu-linha-2">
        <button type="button" onClick={aoCriar}>Novo bloco</button>
        <button type="button" className="class-board-bloco-apagar" disabled={!podeApagar} onClick={aoApagar}>Apagar bloco</button>
        <button type="button" title="Cria uma fileira nova com cinco blocos, embaixo de tudo" onClick={aoCriarFaixa}>Nova faixa</button>
        <button type="button" className="class-board-bloco-apagar" title={`Apaga os blocos da faixa ${faixa}`} disabled={!podeApagar} onClick={() => aoApagarFaixa(faixa)}>Apagar faixa {faixa}</button>
      </div>
      {restauraveis.length > 0 && (
        <div className="class-board-bloco-restaurar" role="group" aria-label="Blocos apagados">
          <button
            type="button"
            className="class-board-menu-toggle"
            aria-expanded={restaurarAberto}
            onClick={() => setRestaurarAberto((v) => !v)}
          >
            <span>Restaurar bloco apagado</span>
            <b>{restauraveis.length}</b>
            <ChevronDown aria-hidden="true" />
          </button>
          {restaurarAberto && (
            <div className="class-board-menu-lista-restaurar">
              {restauraveis.map((r) => (
                <button key={r.id} type="button" aria-label={`Restaurar bloco ${r.label}`} onClick={() => aoRestaurar(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/*
  A lista de cartões de um bloco: faixas da mesma altura (a altura da
  faixa da tag), tantas quantas couberem na altura do bloco — medida
  pelo componente; a última linha nunca fica cortada. Com mais campanhas
  do que cabem, a roda do mouse sobre o bloco troca de página; não há
  arrasto nem marcadores de página (o leitor de tela ouve a página).
  Sem altura medida (testes, telas estreitas) vale FAIXAS_POR_BLOCO.
*/
export const FAIXAS_POR_BLOCO = 4;

/* Quantas faixas cabem numa lista com esta altura, cada faixa com a
   altura dada e este vão entre elas. */
export function faixasQueCabem(alturaLista: number, alturaFaixa: number, vao: number): number {
  if (alturaLista <= 0 || alturaFaixa <= 0) return FAIXAS_POR_BLOCO;
  return Math.max(1, Math.floor((alturaLista + vao) / (alturaFaixa + vao)));
}

function ListaPaginada({
  rotulo,
  itens,
  render,
  vazio,
  aoMedir,
}: {
  rotulo: string;
  itens: CampaignRow[];
  render: (c: CampaignRow) => React.ReactNode;
  vazio: React.ReactNode;
  /** Avisa quantas faixas cabem por página (o painel do bloco filtra por página). */
  aoMedir?: (porPagina: number) => void;
}) {
  const raiz = React.useRef<HTMLDivElement>(null);
  const lista = React.useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = React.useState(0);
  /* A direção da última troca, para a página nova entrar deslizando do
     lado certo (avança: vem da direita; volta: vem da esquerda). */
  const [direcao, setDirecao] = React.useState<"avanca" | "volta">("avanca");
  /* Quantas faixas cabem: a altura da lista vem do bloco (não do
     conteúdo), a altura da faixa é a variável --icone e o vão é o da
     página. Em telas estreitas (blocos com altura natural) vale o
     padrão, para a medida não depender do próprio conteúdo. */
  const [capacidade, setCapacidade] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    const medir = () => {
      const quadro = el.closest<HTMLElement>(".class-board-quadro");
      if (quadro && quadro.clientWidth > 0 && quadro.clientWidth <= 1000) { setCapacidade(FAIXAS_POR_BLOCO); return; }
      const altura = el.clientHeight;
      if (altura <= 0) { setCapacidade(null); return; }
      const estilo = getComputedStyle(el);
      const bruto = estilo.getPropertyValue("--icone").trim();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const faixa = bruto.endsWith("rem") ? parseFloat(bruto) * rem : parseFloat(bruto) || 2 * rem;
      const pagina = el.querySelector<HTMLElement>(".class-board-pagina");
      const vao = (pagina && parseFloat(getComputedStyle(pagina).rowGap)) || 6;
      const cabem = faixasQueCabem(altura, faixa, vao);
      setCapacidade((antes) => (antes === cabem ? antes : cabem));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const porPagina = capacidade ?? Math.max(itens.length, 1);
  const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
  React.useEffect(() => {
    aoMedir?.(porPagina);
  }, [porPagina, aoMedir]);
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = itens.slice(atual * porPagina, atual * porPagina + porPagina);
  const irPara = React.useCallback(
    (alvo: number | ((p: number) => number)) => {
      const n = Math.max(0, Math.min(paginas - 1, typeof alvo === "function" ? alvo(atual) : alvo));
      if (n === atual) return;
      setDirecao(n > atual ? "avanca" : "volta");
      setPagina(n);
    },
    [atual, paginas],
  );

  /* A roda do mouse troca de página (só quando há mais de uma). */
  React.useEffect(() => {
    const el = raiz.current;
    if (!el || paginas <= 1) return;
    let acumulado = 0;
    let travadoAte = 0;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const agora = Date.now();
      if (agora < travadoAte) return;
      acumulado += e.deltaY;
      if (Math.abs(acumulado) < 40) return;
      const passo = acumulado > 0 ? 1 : -1;
      acumulado = 0;
      travadoAte = agora + 260;
      irPara((p) => Math.max(0, Math.min(paginas - 1, p + passo)));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [paginas, irPara]);

  return (
    <div
      ref={raiz}
      className="class-board-lista"
      data-paginas={paginas}
    >
      <div
        ref={lista}
        className="class-board-lista-cartoes"
        data-faixas={porPagina}
        aria-label={`Cartões de ${rotulo}, página ${atual + 1} de ${paginas}`}
      >
        {/* A página entra animada; a chave muda a cada troca. Só as
            faixas que cabem; o resto fica nas páginas seguintes. */}
        <div key={atual} className="class-board-pagina" data-direcao={direcao}>
          {visiveis.map(render)}
          {itens.length === 0 && vazio}
        </div>
      </div>
      {/* A página troca pela roda do mouse. */}
      <span className="sr-only" aria-live="polite">Página {atual + 1} de {paginas}</span>
    </div>
  );
}

/*
  Etiquetas e texto da campanha, editados dentro do painel do neon:
  texto livre e etiquetas coloridas, como no Trello. Salva no navegador.
*/
function EditarNotas({
  nome,
  inicial,
  aoRenomear,
  aoSalvar,
}: {
  nome: string;
  inicial: { etiquetas: Etiqueta[]; texto: string };
  aoRenomear: (nome: string) => Promise<string | null>;
  aoSalvar: (novas: { etiquetas: Etiqueta[]; texto: string }) => void;
}) {
  /* O nome da campanha também se edita aqui: ao salvar, se mudou, a
     campanha é renomeada (na simulação ou na campanha real). */
  const [nomeNovo, setNomeNovo] = React.useState(nome);
  const [erroNome, setErroNome] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [texto, setTexto] = React.useState(inicial.texto);
  const [etiquetas, setEtiquetas] = React.useState<Etiqueta[]>(inicial.etiquetas);
  const [novaEtiqueta, setNovaEtiqueta] = React.useState("");
  const [cor, setCor] = React.useState<Etiqueta["cor"]>("vermelho");
  /* A caixa da descrição cresce com o texto (sem alça de redimensionar). */
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight não inclui a borda: soma-a para a última linha não ficar cortada.
    const borda = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borda}px`;
  }, [texto]);
  /* Uma etiqueta digitada e ainda não adicionada entra na lista ao
     salvar, para o texto não se perder. */
  const comPendente = (): Etiqueta[] => {
    const t = novaEtiqueta.trim().slice(0, 40);
    return t && etiquetas.length < 8 ? [...etiquetas, { texto: t, cor }] : etiquetas;
  };
  const adicionar = () => {
    const proximas = comPendente();
    if (proximas === etiquetas) return;
    setEtiquetas(proximas);
    setNovaEtiqueta("");
  };
  return (
    <form
      className="class-board-editor class-board-neon-notas"
      aria-label={`Anotações de ${nome}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (salvando) return;
        if (nomeNovo.trim() !== nome) {
          setSalvando(true);
          const erro = await aoRenomear(nomeNovo);
          setSalvando(false);
          if (erro) { setErroNome(erro); return; }
        }
        aoSalvar({ etiquetas: comPendente(), texto });
      }}
    >
      <label className="class-board-editor-campo">
        <span>Nome</span>
        <input
          value={nomeNovo}
          maxLength={200}
          aria-label="Nome da campanha"
          className="class-board-nome-campanha"
          onChange={(e) => { setNomeNovo(e.target.value); setErroNome(""); }}
        />
        {erroNome && <p role="alert" className="class-board-tags-erro">{erroNome}</p>}
      </label>
      <div className="class-board-editor-campo">
        <span>Etiquetas</span>
        {etiquetas.length > 0 && (
          <ul className="class-board-etiquetas" aria-label="Etiquetas do cartão">
            {etiquetas.map((e, i) => (
              <li key={`${e.cor}-${e.texto}-${i}`} style={{ background: corDaEtiqueta(e.cor) }}>
                {e.texto}
                <button type="button" aria-label={`Remover etiqueta ${e.texto}`} onClick={() => setEtiquetas((atual) => atual.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="class-board-editor-nova">
          <input
            value={novaEtiqueta}
            maxLength={40}
            placeholder="Nova etiqueta"
            aria-label="Texto da nova etiqueta"
            onChange={(e) => setNovaEtiqueta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
          />
          <button type="button" onClick={adicionar} disabled={!novaEtiqueta.trim() || etiquetas.length >= 8}>Adicionar</button>
        </div>
        {/* As cores da etiqueta são faixas com nome, iguais às do neon da campanha. */}
        <div className="class-board-neon-cores class-board-etiqueta-cores" role="radiogroup" aria-label="Cor da etiqueta">
          {CORES_ETIQUETA.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={cor === c.id}
              aria-label={c.label}
              title={c.label}
              style={{ ["--neon" as string]: c.cor }}
              onClick={() => { if (isCorEtiqueta(c.id)) setCor(c.id); }}
            >
              <span aria-hidden="true" />
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <label className="class-board-editor-campo">
        <span>Descrição</span>
        <textarea
          ref={areaRef}
          value={texto}
          maxLength={600}
          rows={2}
          className="class-board-descricao"
          placeholder="Descrição, observações, próximos passos…"
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <div className="class-board-editor-acoes">
        <button type="submit" className="campaign-drill-abrir" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}

function Cartao({
  campanha: c,
  escopo,
  aberto,
  aoAbrir,
  aoArrastar,
  aoRenomear,
}: {
  campanha: CampaignRow;
  /** A rede da página, para o histórico do ROAS no card do megafone. */
  escopo: string;
  /** A seta está aberta: os dados aparecem na faixa abaixo do bloco. */
  aberto: boolean;
  /** Abre (ou fecha) os dados desta campanha no quadro. */
  aoAbrir: () => void;
  aoArrastar: (ativo: boolean) => void;
  /** Troca o nome da campanha; devolve a mensagem de erro, ou nada. */
  aoRenomear: (nome: string) => Promise<string | null>;
}) {
  /* O card com os números abre num portal, ancorado ao cartão, só ao
     clicar no megafone; fecha com Esc, ao clicar fora, ao rolar para
     longe ou quando outro cartão abre o seu. */
  const [preview, setPreview] = React.useState<CampaignPreview | null>(null);
  /* O painel do neon, preso ao cartão que o abriu (a âncora vira estado
     para nunca ler o ref durante a renderização). */
  const [neonAncora, setNeonAncora] = React.useState<HTMLElement | null>(null);
  const ref = React.useRef<HTMLElement>(null);
  const megafone = React.useRef<HTMLButtonElement>(null);
  const cardId = React.useId();
  /* Anotações do cartão (etiquetas, texto e o neon da faixa); só neste navegador. */
  const { notas, salvar } = useCardNotes(c.id);
  /* Sem neon escolhido a faixa fica escura; o branco só entra quando escolhido. */
  const neon = notas.neon;
  const neonInfo = CORES_NEON.find((n) => n.id === neon);
  /* A saúde da campanha (lucro com o gateway) no semáforo da faixa. */
  const { gatewayPercentual } = useTaxas();
  const saude = saudeDasMetricas(c.metrics, gatewayPercentual);

  const fechar = React.useCallback((restaurarFoco = false) => {
    setPreview(null);
    if (restaurarFoco) megafone.current?.focus({ preventScroll: true });
  }, []);
  const fecharNeon = React.useCallback(() => setNeonAncora(null), []);
  /* Um card flutuante de cada vez: quando outro cartão abre o seu, este fecha na hora. */
  React.useEffect(() => {
    if (!preview) return;
    const outroAbriu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== cardId) fechar();
    };
    window.addEventListener(ABRIU_CARD_FLUTUANTE, outroAbriu);
    return () => window.removeEventListener(ABRIU_CARD_FLUTUANTE, outroAbriu);
  }, [preview, cardId, fechar]);

  function alternar() {
    const el = ref.current;
    if (!el) return;
    if (preview) { fechar(); return; }
    setNeonAncora(null);
    window.dispatchEvent(new CustomEvent(ABRIU_CARD_FLUTUANTE, { detail: cardId }));
    setPreview({ anchor: el });
  }
  function escolherNeon(cor: CorNeon | null) {
    // Sem cor: a faixa volta a ficar escura (o neon sai da anotação).
    const novas: NotasDoCartao = { etiquetas: notas.etiquetas, texto: notas.texto, neon: cor ?? undefined };
    salvar(novas);
    setNeonAncora(null);
  }

  return (
    <article
      ref={ref}
      aria-label={`Cartão ${c.name}`}
      className="class-board-cartao relative rounded-none border-0"
      style={neonInfo ? { ["--neon" as string]: neonInfo.cor } : undefined}
      data-neon={neon ?? "nenhum"}
    >
      {/* Faixa da campanha: megafone colado à esquerda (clique: números;
          arraste: mudar de bloco), nome centrado (clique: editar cor,
          etiquetas e descrição) e a seta colada à direita, que abre a
          campanha. A cor do neon pinta a faixa inteira. */}
      <div className="class-board-cartao-linha">
        <button
          ref={megafone}
          type="button"
          draggable
          aria-label={`Detalhes de ${c.name}`}
          aria-expanded={!!preview}
          aria-controls={preview ? cardId : undefined}
          title="Clique: números da campanha · arraste para outro bloco"
          onClick={alternar}
          onDragStart={(e) => { fechar(); e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; aoArrastar(true); }}
          onDragEnd={() => aoArrastar(false)}
          className="class-board-cartao-tile cursor-grab active:cursor-grabbing"
        >
          <Megaphone className="size-4" />
        </button>
        {/* Clicar na campanha abre o painel de edição (cor, etiquetas e descrição). */}
        <button
          type="button"
          className="class-board-cartao-meio min-w-0 flex-1"
          aria-label={`Editar ${c.name}`}
          aria-expanded={!!neonAncora}
          title={`${neonInfo ? `Neon ${neonInfo.label.toLowerCase()}` : "Sem neon"} · clique para editar cor, etiquetas e descrição`}
          onClick={() => { fechar(); setNeonAncora((atual) => (atual ? null : ref.current)); }}
        >
          <b className="class-board-cartao-nome block text-[0.8125rem] leading-tight" title={c.name}>{nomeCurto(c.name)}</b>
          {(notas.etiquetas.length > 0 || notas.texto) && (
            <div className="class-board-cartao-sub">
              {notas.etiquetas.length > 0 && (
                <ul className="class-board-etiquetas" aria-label="Etiquetas">
                  {notas.etiquetas.map((e, i) => (
                    <li key={`${e.cor}-${e.texto}-${i}`} style={{ background: corDaEtiqueta(e.cor) }}>{e.texto}</li>
                  ))}
                </ul>
              )}
              {notas.texto && <p className="class-board-cartao-texto text-muted-foreground text-[0.6875rem] leading-snug">{notas.texto}</p>}
            </div>
          )}
        </button>
        {/* O semáforo da campanha: verde (pulsando) = lucro, laranja =
            empate, vermelha = prejuízo; sem investimento, as três apagadas. */}
        <Semaforo className="class-board-cartao-semaforo" saude={saude} rotulo={`Saúde de ${c.name}`} titulo={descricaoDaSaude(c.metrics, gatewayPercentual)} />
        <button
          type="button"
          aria-label={`${aberto ? "Fechar" : "Abrir"} campanha ${c.name}`}
          aria-expanded={aberto}
          title={aberto ? "Fechar os dados da campanha" : "Ver todos os dados da campanha aqui"}
          className="class-board-cartao-abrir focus-visible:ring-ring outline-none focus-visible:ring-2"
          onClick={() => { fechar(); setNeonAncora(null); aoAbrir(); }}
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>


      {neonAncora && (
        <PainelFlutuante ancora={neonAncora} rotulo={`Neon de ${c.name}`} onClose={fecharNeon}>
          <div className="class-board-neon-cores" role="radiogroup" aria-label="Cor do neon">
            <button
              type="button"
              role="radio"
              aria-checked={!neon}
              aria-label="Sem cor"
              title="Tirar a cor da faixa"
              className="class-board-neon-sem-cor"
              onClick={() => escolherNeon(null)}
            >
              <span aria-hidden="true" />
              Sem cor
            </button>
            {CORES_NEON.map((n) => (
              <button
                key={n.id}
                type="button"
                role="radio"
                aria-checked={neon === n.id}
                aria-label={n.label}
                title={n.label}
                style={{ ["--neon" as string]: n.cor }}
                onClick={() => { if (isCorNeon(n.id)) escolherNeon(n.id); }}
              >
                <span aria-hidden="true" />
                {n.label}
              </button>
            ))}
          </div>
          <EditarNotas
            nome={c.name}
            inicial={notas}
            aoRenomear={aoRenomear}
            aoSalvar={(novas) => { if (salvar({ ...novas, neon: notas.neon })) setNeonAncora(null); }}
          />
        </PainelFlutuante>
      )}

      {preview && (
        <CampaignHoverCard
          preview={preview}
          campanha={c}
          id={cardId}
          escopo={escopo}
          onClose={fechar}
        />
      )}
    </article>
  );
}
