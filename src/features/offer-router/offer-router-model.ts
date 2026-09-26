/*
  O modelo do Roteador de ofertas — configurar qual página recebe o
  tráfego e mandar uma parte dos visitantes para outra página (por região,
  aparelho ou uma fatia do tráfego). Tudo puro, para o teste não depender
  de nada. A tela é só demonstração — nada roteia de verdade.

  Reaproveita países e aparelhos do Filtro de acesso, para o vocabulário
  ser o mesmo nas duas telas.
*/

import {
  DeviceKind,
  Visitor,
  nomeDoDispositivo,
  nomeDoPais,
} from "@/features/access-filter/access-filter-model";

export type { DeviceKind, Visitor };

/** O critério de uma regra: por região (país), por aparelho, ou por fatia %. */
export type MatchKind = "regiao" | "dispositivo" | "fatia";

/** Uma regra de redirecionamento de uma página. */
export interface RedirectRule {
  id: string;
  tipo: MatchKind;
  /** Países da regra (quando tipo = "regiao"). */
  paises: string[];
  /** Aparelhos da regra (quando tipo = "dispositivo"). */
  dispositivos: DeviceKind[];
  /** Fatia do tráfego 1–100 (quando tipo = "fatia"). */
  percentual: number;
  /** Para onde o visitante que bate na regra é mandado. */
  destino: string;
  ativo: boolean;
}

/** Uma página/oferta com suas regras de redirecionamento. */
export interface OfferPage {
  id: string;
  nome: string;
  /** A página de origem — quem não bate em regra nenhuma fica aqui. */
  url: string;
  regras: RedirectRule[];
}

/** Uma fatia de um gráfico de barras (de onde vêm os visitantes). */
export interface Fatia {
  rotulo: string;
  pct: number;
}

export interface DecisaoDeRota {
  /** Para onde o visitante vai. */
  destino: string;
  /** A regra que decidiu, quando houve uma. */
  regra?: RedirectRule;
  /** Verdadeiro quando ninguém barrou e o visitante fica na origem. */
  ficou: boolean;
}

/**
 * Decide para onde um visitante vai numa página. A primeira regra ativa
 * que bate decide (ordem importa); sem nenhuma, o visitante fica na
 * origem. `sorteio` (0–99) representa o "número da roleta" do visitante,
 * para as regras de fatia do tráfego.
 */
export function decidirDestino(
  pagina: OfferPage,
  visitante: Visitor,
  sorteio: number,
): DecisaoDeRota {
  for (const r of pagina.regras) {
    if (!r.ativo) continue;
    let bate = false;
    if (r.tipo === "regiao") bate = r.paises.includes(visitante.pais);
    else if (r.tipo === "dispositivo")
      bate = r.dispositivos.includes(visitante.dispositivo);
    else if (r.tipo === "fatia") bate = sorteio < r.percentual;
    if (bate && r.destino.trim())
      return { destino: r.destino, regra: r, ficou: false };
  }
  return { destino: pagina.url, ficou: true };
}

/** Descreve, em uma frase, quem uma regra pega. */
export function descreverRegra(regra: RedirectRule): string {
  if (regra.tipo === "regiao")
    return regra.paises.length
      ? `Quem é de ${regra.paises.map(nomeDoPais).join(", ")}`
      : "Quem é de (nenhum país escolhido)";
  if (regra.tipo === "dispositivo")
    return regra.dispositivos.length
      ? `Quem usa ${regra.dispositivos.map(nomeDoDispositivo).join(", ").toLowerCase()}`
      : "Quem usa (nenhum aparelho escolhido)";
  return `${regra.percentual}% do tráfego`;
}

/** Só as páginas que têm ao menos uma regra ativa de redirecionamento. */
export function paginasComRedirecionamento(paginas: OfferPage[]): OfferPage[] {
  return paginas.filter((p) => p.regras.some((r) => r.ativo && r.destino.trim()));
}

/** Quantas regras ativas de redirecionamento existem no total. */
export function totalDeRedirecionamentos(paginas: OfferPage[]): number {
  return paginas.reduce(
    (n, p) => n + p.regras.filter((r) => r.ativo && r.destino.trim()).length,
    0,
  );
}

/** As páginas de exemplo com que a tela abre. */
export const PAGINAS_EXEMPLO: OfferPage[] = [
  {
    id: "oferta",
    nome: "Oferta principal",
    url: "/oferta",
    regras: [
      {
        id: "r1",
        tipo: "regiao",
        paises: ["RU", "IN", "NG"],
        dispositivos: [],
        percentual: 50,
        destino: "/indisponivel",
        ativo: true,
      },
      {
        id: "r2",
        tipo: "dispositivo",
        paises: [],
        dispositivos: ["desktop"],
        percentual: 50,
        destino: "/versao-computador",
        ativo: true,
      },
    ],
  },
  {
    id: "quiz",
    nome: "Quiz de entrada",
    url: "/quiz",
    regras: [
      {
        id: "r3",
        tipo: "fatia",
        paises: [],
        dispositivos: [],
        percentual: 50,
        destino: "/quiz-b",
        ativo: true,
      },
    ],
  },
  {
    id: "vip",
    nome: "Página VIP",
    url: "/vip",
    regras: [],
  },
];

/** De onde vêm os visitantes da página principal — aparelho (demonstração). */
export const POR_DISPOSITIVO: Fatia[] = [
  { rotulo: "Celular", pct: 68 },
  { rotulo: "Computador", pct: 26 },
  { rotulo: "Tablet", pct: 6 },
];

/** De onde vêm os visitantes da página principal — região (demonstração). */
export const POR_REGIAO: Fatia[] = [
  { rotulo: "Sudeste (BR)", pct: 42 },
  { rotulo: "Nordeste (BR)", pct: 19 },
  { rotulo: "Sul (BR)", pct: 15 },
  { rotulo: "Portugal", pct: 12 },
  { rotulo: "Outros", pct: 12 },
];

/** Uma regra nova em branco, do tipo escolhido. */
export function regraNova(id: string, tipo: MatchKind): RedirectRule {
  return {
    id,
    tipo,
    paises: [],
    dispositivos: [],
    percentual: 50,
    destino: "",
    ativo: true,
  };
}

/** Uma linha do registro de quem foi redirecionado (demonstração). */
export interface EventoRedirecionado {
  regiao: string;
  dispositivo: string;
  destino: string;
  qtd: number;
}

/**
 * Quem tentou entrar na página principal e foi redirecionado, por região e
 * aparelho (demonstração). Numa versão ligada, viria do registro real.
 */
export const REDIRECIONADOS_EXEMPLO: EventoRedirecionado[] = [
  { regiao: "Rússia", dispositivo: "Celular", destino: "/indisponivel", qtd: 128 },
  { regiao: "Índia", dispositivo: "Celular", destino: "/indisponivel", qtd: 96 },
  { regiao: "Sudeste (BR)", dispositivo: "Computador", destino: "/versao-computador", qtd: 74 },
  { regiao: "Sul (BR)", dispositivo: "Computador", destino: "/versao-computador", qtd: 39 },
  { regiao: "Nigéria", dispositivo: "Tablet", destino: "/indisponivel", qtd: 21 },
];

/** O total de visitantes redirecionados no registro. */
export function totalRedirecionados(linhas: EventoRedirecionado[]): number {
  return linhas.reduce((n, l) => n + l.qtd, 0);
}
