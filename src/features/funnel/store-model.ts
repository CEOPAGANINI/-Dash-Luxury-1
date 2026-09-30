/*
  O bloco Loja do quadro do funil: uma loja (própria na VPS, Shopify,
  Nuvemshop, WooCommerce…) com os produtos que o funil empurra. Só
  interface (Fase 1): nada conecta de verdade; a integração real da
  Shopify já existe em Integrações e será ligada aqui na Fase 2.
*/

import { PAGINAS_VPS } from "@/features/vps/catalogo-demo";

export type PlataformaLoja = "vps" | "shopify" | "nuvemshop" | "woocommerce" | "outra";

export const PLATAFORMAS: { id: PlataformaLoja; nome: string; dica: string; exemplo: string }[] = [
  { id: "vps", nome: "Loja própria (VPS)", dica: "Hospedada no seu servidor, com os domínios do painel.", exemplo: "loja-suprema.com" },
  { id: "shopify", nome: "Shopify", dica: "Já existe integração em Integrações; liga na Fase 2.", exemplo: "minhaloja.myshopify.com" },
  { id: "nuvemshop", nome: "Nuvemshop", dica: "Loja na Nuvemshop, com checkout deles.", exemplo: "minhaloja.lojavirtualnuvem.com.br" },
  { id: "woocommerce", nome: "WooCommerce", dica: "Loja em WordPress com WooCommerce.", exemplo: "minhaloja.com.br" },
  { id: "outra", nome: "Outra plataforma", dica: "Qualquer loja com um endereço.", exemplo: "minhaloja.com" },
];

export interface ProdutoLoja {
  id: string;
  nome: string;
  /** Preço em reais (ou na moeda da loja). */
  preco: number;
  /** Caminho na loja (ex.: /produto/relogio). */
  caminho: string;
  ativo: boolean;
}

export interface DadosLoja {
  plataforma: PlataformaLoja;
  /** Domínio da loja (da VPS ou externo). */
  dominio?: string;
  moeda: "BRL" | "USD";
  produtos: ProdutoLoja[];
  /** O produto que este funil empurra (alimenta o checkout ligado). */
  destaqueId?: string;
}

export function lojaVazia(): DadosLoja {
  return { plataforma: "vps", moeda: "BRL", produtos: [] };
}

/** Preço de demonstração estável a partir do nome (97 a 497). */
function precoDemo(nome: string): number {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return [97, 147, 197, 247, 297, 397, 497][h % 7];
}

/** Os produtos que a VPS já tem num domínio (demonstração). */
export function produtosDaVps(host: string): ProdutoLoja[] {
  return PAGINAS_VPS.filter((p) => p.host === host && p.tipo === "produto").map((p) => ({
    id: `vps-${p.id}`,
    nome: p.nome,
    preco: precoDemo(p.nome),
    caminho: p.caminho,
    ativo: true,
  }));
}

/** A loja de demonstração (Loja Suprema, da VPS). */
export function lojaDemo(): DadosLoja {
  const produtos = produtosDaVps("loja-suprema.com");
  return { plataforma: "vps", dominio: "loja-suprema.com", moeda: "BRL", produtos, destaqueId: produtos[0]?.id };
}

export function nomeDaPlataforma(id: PlataformaLoja): string {
  return PLATAFORMAS.find((p) => p.id === id)?.nome ?? id;
}

/** "R$ 197" na moeda da loja. */
export function precoTxt(v: number, moeda: DadosLoja["moeda"] = "BRL"): string {
  return v.toLocaleString(moeda === "USD" ? "en-US" : "pt-BR", { style: "currency", currency: moeda, maximumFractionDigits: 0 });
}

/** Resumo curto para o bloco: "3 produtos · destaque: Relógio Aviator". */
export function resumoDaLoja(l: DadosLoja | undefined): string {
  if (!l || l.produtos.length === 0) return "Sem produtos ainda";
  const ativos = l.produtos.filter((p) => p.ativo).length;
  const d = l.produtos.find((p) => p.id === l.destaqueId);
  return `${ativos} ${ativos === 1 ? "produto" : "produtos"}${d ? ` · destaque: ${d.nome}` : ""}`;
}
