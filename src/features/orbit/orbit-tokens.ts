/*
  Orbit · Nebula — os tokens do design system do painel.

  Vieram de dois sítios e foram fundidos de propósito:

  - do **Orbit** ficou a estrutura — a escala de tipos (48/28/16/14/12), a
    escala de respiros (4…64), os raios com nome (etiqueta, controlo, bloco),
    o tempo do movimento (150/250 ms) e a ideia de blocos ligados por fios
    com portas de entrada e de saída;
  - do **Nebula** ficou a cor — preto e branco, com cinzas neutros, e só
    três cores com significado que o Nebula já guardava: positivo, negativo
    e informativo.

  Por isso nenhuma cor aqui é um hexadecimal cravado na página. Cada token
  aponta para a variável do Nebula (`--nebula-*`), que muda sozinha entre o
  tema escuro e o claro. Os hexadecimais que estão aqui em baixo são só
  documentação: é o que a variável vale em cada tema, para a ficha de cor
  conseguir dizer o valor por extenso.

  O JSON continua em public/orbit-tokens.json, para o botão de descarregar,
  e é gerado a partir destes mesmos valores — o teste compara os dois e
  falha assim que um divergir.
*/

export type TokenDeCor = {
  /** A variável do Nebula de onde a cor sai, em tempo de execução. */
  variavel: string;
  /** O valor no tema escuro, só para documentar. */
  escuro: string;
  /** O valor no tema claro, só para documentar. */
  claro: string;
};

export const ORBIT_TOKENS = {
  color: {
    canvas: { variavel: "--nebula-bg", escuro: "#090909", claro: "#f5f5f5" },
    surface: {
      variavel: "--nebula-panel",
      escuro: "#121212",
      claro: "#ffffff",
    },
    raised: {
      variavel: "--nebula-panel-2",
      escuro: "#191919",
      claro: "#f0f0f0",
    },
    input: { variavel: "--nebula-bg-2", escuro: "#0d0d0d", claro: "#eeeeee" },
    border: {
      variavel: "--nebula-line-strong",
      escuro: "rgb(255 255 255 / 15%)",
      claro: "rgb(0 0 0 / 17%)",
    },
    text: { variavel: "--nebula-text", escuro: "#f5f5f5", claro: "#171717" },
    secondary: {
      variavel: "--nebula-muted",
      escuro: "#a3a3a3",
      claro: "#5e5e5e",
    },
    muted: { variavel: "--nebula-faint", escuro: "#929292", claro: "#686868" },
    positive: {
      variavel: "--nebula-positive",
      escuro: "#6ee7b7",
      claro: "#08774d",
    },
    negative: {
      variavel: "--nebula-negative",
      escuro: "#fb7185",
      claro: "#bc2748",
    },
    info: { variavel: "--nebula-cyan", escuro: "#4fd1e0", claro: "#087d8b" },
    model: {
      variavel: "--nebula-accent-2",
      escuro: "#a3a3a3",
      claro: "#737373",
    },
    generator: {
      variavel: "--nebula-accent",
      escuro: "#f5f5f5",
      claro: "#171717",
    },
  },
  font: {
    family: "Inter, system-ui, sans-serif",
    size: { display: 48, title: 28, body: 16, label: 14, metadata: 12 },
    weight: [400, 500, 600],
  },
  spacing: [4, 8, 12, 16, 24, 32, 48, 64],
  radius: { tag: 6, control: 11, node: 16, panel: 24 },
  motion: { fast: "150ms", normal: "250ms", easing: "ease-out" },
} as const;

export type OrbitColor = keyof typeof ORBIT_TOKENS.color;

/** As neutras: fazem as superfícies, as bordas e o texto. */
export const CORES_BASE: { chave: OrbitColor; nome: string; uso: string }[] = [
  { chave: "canvas", nome: "Canvas", uso: "O fundo de tudo" },
  { chave: "surface", nome: "Superfície", uso: "Blocos e cartões" },
  { chave: "raised", nome: "Elevada", uso: "O que flutua por cima" },
  { chave: "input", nome: "Campo", uso: "Onde se escreve" },
  { chave: "border", nome: "Borda", uso: "Fios e divisórias" },
  { chave: "text", nome: "Texto", uso: "O que se lê primeiro" },
  { chave: "secondary", nome: "Secundário", uso: "Apoio e rótulos" },
  { chave: "muted", nome: "Discreto", uso: "Metadados" },
];

/*
  As cinco com significado. Duas delas — modelo e gerador — deixaram de ser
  amarelo e roxo quando o painel virou preto e branco: agora são um cinzento
  elevado e o acento do tema. Continuam a distinguir o tipo de ligação
  porque a cor nunca anda sozinha; anda sempre com o rótulo ao lado.
*/
export const CORES_SEMANTICAS: {
  chave: OrbitColor;
  nome: string;
  uso: string;
}[] = [
  { chave: "positive", nome: "Positivo", uso: "Ação principal e lucro" },
  { chave: "negative", nome: "Negativo", uso: "Erro e prejuízo" },
  { chave: "info", nome: "Informativo", uso: "Aviso sem gravidade" },
  { chave: "model", nome: "Modelo", uso: "A saída de um bloco" },
  { chave: "generator", nome: "Gerador", uso: "O bloco que junta tudo" },
];

/** Os tokens como variáveis de CSS, para o elemento raiz da página. */
export function variaveisDoOrbit(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [nome, token] of Object.entries(ORBIT_TOKENS.color)) {
    vars[`--orbit-${nome}`] = `var(${token.variavel})`;
  }
  for (const [nome, valor] of Object.entries(ORBIT_TOKENS.font.size)) {
    vars[`--orbit-texto-${nome}`] = `${valor}px`;
  }
  for (const [nome, valor] of Object.entries(ORBIT_TOKENS.radius)) {
    vars[`--orbit-raio-${nome}`] = `${valor}px`;
  }
  vars["--orbit-sombra"] = "var(--nebula-shadow)";
  vars["--orbit-fonte"] = ORBIT_TOKENS.font.family;
  vars["--orbit-rapido"] = ORBIT_TOKENS.motion.fast;
  vars["--orbit-normal"] = ORBIT_TOKENS.motion.normal;
  vars["--orbit-suavizacao"] = ORBIT_TOKENS.motion.easing;
  return vars;
}
