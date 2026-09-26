import * as React from "react";

/*
  Bandeiras dos países desenhadas em SVG — para aparecerem em qualquer
  aparelho. O emoji de bandeira não renderiza em vários sistemas (Windows,
  alguns navegadores): aparece só o código ("BR", "PT"). Estas são
  simplificadas, mas reconhecíveis no tamanho de um chip. Código
  desconhecido cai num selo com a sigla.

  Usada pelo Filtro de acesso e pelo Roteador de ofertas.
*/

/** Uma estrela de cinco pontas, numa caixa 10×10, para deslocar/escalar. */
const ESTRELA = "M5 0 6.18 3.63 10 3.63 6.91 5.87 8.09 9.51 5 7.27 1.91 9.51 3.09 5.87 0 3.63 3.82 3.63Z";

/** O desenho de cada bandeira, no espaço 30×20. */
const BANDEIRAS: Record<string, React.ReactNode> = {
  BR: (
    <>
      <rect width="30" height="20" fill="#009b3a" />
      <path d="M15 2 27 10 15 18 3 10Z" fill="#fedf00" />
      <circle cx="15" cy="10" r="3.8" fill="#002776" />
    </>
  ),
  PT: (
    <>
      <rect width="30" height="20" fill="#da291c" />
      <rect width="12" height="20" fill="#046a38" />
      <circle cx="12" cy="10" r="2.4" fill="#ffe900" />
      <circle cx="12" cy="10" r="1.1" fill="#da291c" />
    </>
  ),
  US: (
    <>
      <rect width="30" height="20" fill="#b22234" />
      <rect y="2.9" width="30" height="2.9" fill="#fff" />
      <rect y="8.6" width="30" height="2.9" fill="#fff" />
      <rect y="14.3" width="30" height="2.9" fill="#fff" />
      <rect width="13" height="11.4" fill="#3c3b6e" />
      <g fill="#fff">
        <circle cx="3" cy="3" r="0.8" />
        <circle cx="7" cy="3" r="0.8" />
        <circle cx="11" cy="3" r="0.8" />
        <circle cx="5" cy="6" r="0.8" />
        <circle cx="9" cy="6" r="0.8" />
        <circle cx="3" cy="9" r="0.8" />
        <circle cx="7" cy="9" r="0.8" />
        <circle cx="11" cy="9" r="0.8" />
      </g>
    </>
  ),
  RU: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0039a6" />
      <rect y="13.33" width="30" height="6.67" fill="#d52b1e" />
    </>
  ),
  MX: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#006847" />
      <rect x="20" width="10" height="20" fill="#ce1126" />
      <circle cx="15" cy="10" r="2" fill="#8c5a2b" />
    </>
  ),
  AR: (
    <>
      <rect width="30" height="20" fill="#74acdf" />
      <rect y="6.67" width="30" height="6.67" fill="#fff" />
      <circle cx="15" cy="10" r="1.9" fill="#f6b40e" />
    </>
  ),
  ES: (
    <>
      <rect width="30" height="20" fill="#aa151b" />
      <rect y="5" width="30" height="10" fill="#f1bf00" />
    </>
  ),
  CO: (
    <>
      <rect width="30" height="20" fill="#fcd116" />
      <rect y="10" width="30" height="5" fill="#003893" />
      <rect y="15" width="30" height="5" fill="#ce1126" />
    </>
  ),
  CL: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect y="10" width="30" height="10" fill="#d52b1e" />
      <rect width="10" height="10" fill="#0039a6" />
      <g transform="translate(2 2) scale(0.6)" fill="#fff">
        <path d={ESTRELA} />
      </g>
    </>
  ),
  IN: (
    <>
      <rect width="30" height="6.67" fill="#ff9933" />
      <rect y="6.67" width="30" height="6.67" fill="#fff" />
      <rect y="13.33" width="30" height="6.67" fill="#138808" />
      <circle cx="15" cy="10" r="2" fill="none" stroke="#000080" strokeWidth="0.8" />
    </>
  ),
  DE: (
    <>
      <rect width="30" height="6.67" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#dd0000" />
      <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
    </>
  ),
  FR: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#0055a4" />
      <rect x="20" width="10" height="20" fill="#ef4135" />
    </>
  ),
  GB: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" strokeWidth="2" />
      <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0V20M0 10H30" stroke="#c8102e" strokeWidth="3.5" />
    </>
  ),
  IT: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#009246" />
      <rect x="20" width="10" height="20" fill="#ce2b37" />
    </>
  ),
  CN: (
    <>
      <rect width="30" height="20" fill="#de2910" />
      <g transform="translate(2 2) scale(0.9)" fill="#ffde00">
        <path d={ESTRELA} />
      </g>
      <g transform="translate(11 1) scale(0.28)" fill="#ffde00">
        <path d={ESTRELA} />
      </g>
      <g transform="translate(13 4) scale(0.28)" fill="#ffde00">
        <path d={ESTRELA} />
      </g>
      <g transform="translate(13 7) scale(0.28)" fill="#ffde00">
        <path d={ESTRELA} />
      </g>
      <g transform="translate(11 9) scale(0.28)" fill="#ffde00">
        <path d={ESTRELA} />
      </g>
    </>
  ),
  NG: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#008751" />
      <rect x="20" width="10" height="20" fill="#008751" />
    </>
  ),
};

export function CountryFlag({
  code,
  size = 18,
}: {
  code: string;
  size?: number;
}) {
  const desenho = BANDEIRAS[code];
  const estilo: React.CSSProperties = {
    display: "inline-block",
    width: size,
    height: Math.round((size * 2) / 3),
    borderRadius: 2,
    overflow: "hidden",
    border: "1px solid rgb(0 0 0 / 25%)",
    flex: "none",
    verticalAlign: "middle",
    boxShadow: "0 0 0 0.5px rgb(255 255 255 / 12%)",
  };
  if (!desenho) {
    return (
      <span
        aria-hidden
        style={{
          ...estilo,
          width: "auto",
          padding: "1px 4px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 9,
          lineHeight: 1.4,
          color: "currentColor",
          background: "rgb(255 255 255 / 8%)",
        }}
      >
        {code}
      </span>
    );
  }
  return (
    <span aria-hidden style={estilo}>
      <svg
        viewBox="0 0 30 20"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        {desenho}
      </svg>
    </span>
  );
}
