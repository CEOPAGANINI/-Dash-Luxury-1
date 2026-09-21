import { z } from "zod";

/*
  A configuração de um checkout: o que o editor guarda em
  checkouts.config e o que a página do checkout lê para se desenhar.

  Tudo aqui é conta pura e validação — sem banco e sem navegador —, para
  o servidor e a tela lerem a mesma coisa. Nada de valores inventados:
  o que não estiver guardado volta ao padrão declarado abaixo.
*/

export const CAMPOS_DO_CHECKOUT = [
  { id: "nome", rotulo: "Nome completo", fixo: true },
  { id: "email", rotulo: "E-mail", fixo: true },
  { id: "telefone", rotulo: "Telefone", fixo: false },
  { id: "documento", rotulo: "CPF ou CNPJ", fixo: false },
  { id: "endereco", rotulo: "Endereço de entrega", fixo: false },
  { id: "cupom", rotulo: "Cupom de desconto", fixo: false },
] as const;
export type CampoId = (typeof CAMPOS_DO_CHECKOUT)[number]["id"];

export const PAGAMENTOS = [
  { id: "pix", rotulo: "Pix" },
  { id: "cartao", rotulo: "Cartão" },
  { id: "boleto", rotulo: "Boleto" },
] as const;
export type PagamentoId = (typeof PAGAMENTOS)[number]["id"];

export const LAYOUTS = [
  { id: "uma-pagina", rotulo: "Uma página", legenda: "Tudo numa tela só" },
  { id: "etapas", rotulo: "Em etapas", legenda: "Dados, entrega e pagamento" },
] as const;
export type LayoutId = (typeof LAYOUTS)[number]["id"];

export const TELAS = [
  { id: "computador", rotulo: "Computador", largura: 900 },
  { id: "tablet", rotulo: "Tablet", largura: 640 },
  { id: "celular", rotulo: "Celular", largura: 380 },
] as const;
export type TelaId = (typeof TELAS)[number]["id"];

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const campoSchema = z.object({
  id: z.enum(["nome", "email", "telefone", "documento", "endereco", "cupom"]),
  ativo: z.boolean(),
  obrigatorio: z.boolean(),
});

export const checkoutConfigSchema = z.object({
  version: z.literal(1),
  layout: z.enum(["uma-pagina", "etapas"]),
  textos: z.object({
    titulo: z.string().max(80),
    subtitulo: z.string().max(140),
    botao: z.string().min(1).max(40),
    seguranca: z.string().max(140),
  }),
  cores: z.object({ fundo: cor, texto: cor, destaque: cor }),
  campos: z.array(campoSchema).max(20),
  pagamentos: z.array(z.enum(["pix", "cartao", "boleto"])).max(3),
  selos: z.object({ compraSegura: z.boolean(), garantia: z.boolean(), ssl: z.boolean() }),
  garantiaDias: z.number().int().min(0).max(365),
  contador: z.object({ ativo: z.boolean(), minutos: z.number().int().min(1).max(120) }),
  orderBump: z.object({
    ativo: z.boolean(),
    titulo: z.string().max(80),
    texto: z.string().max(200),
    precoCents: z.number().int().min(0).max(100_000_000),
  }),
  depoimentos: z
    .array(z.object({ nome: z.string().min(1).max(60), texto: z.string().min(1).max(240) }))
    .max(6),
});
export type CheckoutConfig = z.infer<typeof checkoutConfigSchema>;

export const CONFIG_PADRAO: CheckoutConfig = {
  version: 1,
  layout: "uma-pagina",
  textos: {
    titulo: "Finalize a sua compra",
    subtitulo: "Leva menos de um minuto.",
    botao: "Comprar agora",
    seguranca: "Pagamento processado em ambiente seguro.",
  },
  cores: { fundo: "#ffffff", texto: "#101014", destaque: "#1eb85c" },
  campos: [
    { id: "nome", ativo: true, obrigatorio: true },
    { id: "email", ativo: true, obrigatorio: true },
    { id: "telefone", ativo: true, obrigatorio: true },
    { id: "documento", ativo: true, obrigatorio: true },
    { id: "endereco", ativo: false, obrigatorio: false },
    { id: "cupom", ativo: true, obrigatorio: false },
  ],
  pagamentos: ["pix", "cartao", "boleto"],
  selos: { compraSegura: true, garantia: true, ssl: true },
  garantiaDias: 7,
  contador: { ativo: false, minutos: 15 },
  orderBump: { ativo: false, titulo: "Leve também", texto: "Adicione por um preço especial nesta compra.", precoCents: 0 },
  depoimentos: [],
};

/* Uma lista de campos completa: os guardados (sem repetidos nem ids
   estranhos) e, no fim, os que faltarem — assim um campo novo do
   produto nunca desaparece de um checkout antigo. Os campos fixos
   (nome e e-mail) voltam sempre ligados e obrigatórios. */
export function completarCampos(lista: readonly unknown[]): CheckoutConfig["campos"] {
  const vistos = new Set<CampoId>();
  const campos: CheckoutConfig["campos"] = [];
  for (const bruto of lista) {
    const r = campoSchema.safeParse(bruto);
    if (!r.success || vistos.has(r.data.id)) continue;
    vistos.add(r.data.id);
    campos.push(r.data);
  }
  for (const c of CAMPOS_DO_CHECKOUT) {
    if (!vistos.has(c.id)) campos.push(CONFIG_PADRAO.campos.find((x) => x.id === c.id)!);
  }
  return campos.map((c) => (CAMPOS_DO_CHECKOUT.find((x) => x.id === c.id)?.fixo ? { ...c, ativo: true, obrigatorio: true } : c));
}

/** A configuração guardada, saneada; o que faltar volta ao padrão. */
export function completarConfig(bruta: unknown): CheckoutConfig {
  const objeto = typeof bruta === "object" && bruta !== null ? (bruta as Record<string, unknown>) : {};
  const juntado = { ...CONFIG_PADRAO, ...objeto, version: 1 as const };
  const r = checkoutConfigSchema.safeParse({
    ...juntado,
    textos: { ...CONFIG_PADRAO.textos, ...(objeto.textos as object) },
    cores: { ...CONFIG_PADRAO.cores, ...(objeto.cores as object) },
    selos: { ...CONFIG_PADRAO.selos, ...(objeto.selos as object) },
    contador: { ...CONFIG_PADRAO.contador, ...(objeto.contador as object) },
    orderBump: { ...CONFIG_PADRAO.orderBump, ...(objeto.orderBump as object) },
    campos: completarCampos(Array.isArray(objeto.campos) ? objeto.campos : []),
    pagamentos: Array.isArray(objeto.pagamentos) ? objeto.pagamentos : CONFIG_PADRAO.pagamentos,
    depoimentos: Array.isArray(objeto.depoimentos) ? objeto.depoimentos : [],
  });
  if (r.success) {
    // Sem forma de pagamento nenhuma o checkout não existe: volta o Pix.
    return r.data.pagamentos.length ? r.data : { ...r.data, pagamentos: ["pix"] };
  }
  return CONFIG_PADRAO;
}

export function restoreCheckoutConfig(raw: string): CheckoutConfig | null {
  try {
    return completarConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Os campos que aparecem na página, na ordem escolhida. */
export function camposVisiveis(config: CheckoutConfig) {
  return config.campos
    .filter((c) => c.ativo)
    .map((c) => ({ ...c, rotulo: CAMPOS_DO_CHECKOUT.find((x) => x.id === c.id)?.rotulo ?? c.id }));
}

/** Um campo fixo não se desliga nem deixa de ser obrigatório. */
export function campoEhFixo(id: CampoId): boolean {
  return CAMPOS_DO_CHECKOUT.find((c) => c.id === id)?.fixo ?? false;
}

/* Quantos passos o checkout tem: uma página é sempre um; em etapas,
   dados e pagamento, mais entrega quando o endereço está ligado. */
export function passosDoCheckout(config: CheckoutConfig): string[] {
  if (config.layout === "uma-pagina") return ["Seus dados e pagamento"];
  const tem = (id: CampoId) => config.campos.some((c) => c.id === id && c.ativo);
  return ["Seus dados", ...(tem("endereco") ? ["Entrega"] : []), "Pagamento"];
}
