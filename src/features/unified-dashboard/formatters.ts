export function formatCurrency(value: number, maximumFractionDigits = 0) {
  if (!Number.isFinite(value)) value = 0;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits,
  });
}

export function formatCompactCurrency(value: number) {
  if (!Number.isFinite(value)) value = 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= 1_000) {
    return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `${sign}${formatCurrency(abs)}`;
}

/**
 * O mesmo valor curto, sem o "R$" na frente. Existe para caixas muito
 * estreitas, onde os 20px do símbolo custariam o número inteiro — nelas a
 * moeda já está dita em volta, no rótulo da caixa ou no resumo do painel.
 */
export function formatCompactAmount(value: number) {
  /* O espaço depois do "R$" que o pt-BR devolve é um espaço fixo (U+00A0),
     e não o espaço comum — por isso a regex com \s, que pega os dois. O sinal
     de negativo fica, porque ele muda o que o número diz. */
  return formatCompactCurrency(value).replace(/R\$\s*/u, "");
}

export function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) value = 0;
  return `${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatRatio(value: number, digits = 2) {
  if (!Number.isFinite(value)) value = 0;
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}x`;
}

export function formatInteger(value: number) {
  if (!Number.isFinite(value)) value = 0;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
