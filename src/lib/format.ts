const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const moedaCurta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const inteiro = new Intl.NumberFormat("pt-BR");

export function reais(valor: number) {
  return moeda.format(valor);
}

export function reaisCurto(valor: number) {
  return moedaCurta.format(valor);
}

export function numero(valor: number) {
  return inteiro.format(valor);
}

export function porcentagem(valor: number, casas = 1) {
  return `${valor.toFixed(casas).replace(".", ",")}%`;
}

export function multiplicador(valor: number) {
  return `${valor.toFixed(2).replace(".", ",")}x`;
}

export function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function diaMes(iso: string) {
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}
