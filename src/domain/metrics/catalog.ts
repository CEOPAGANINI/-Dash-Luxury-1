export type MetricDirection = "higher" | "lower" | "contextual";
export type MetricStatus =
  "confirmed" | "provisional" | "estimated" | "unavailable";
export type MetricFormat =
  "currency" | "percent" | "ratio" | "number" | "duration";

export interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  formula: string;
  source: string;
  grain: string;
  owner: string;
  direction: MetricDirection;
  format: MetricFormat;
  unit: string;
  status: MetricStatus;
  defaultComparison: string;
  semanticRule: string;
  freshnessSlaMinutes: number | null;
  drilldown: string;
}

function metric(definition: MetricDefinition): MetricDefinition {
  return Object.freeze(definition);
}

/**
 * Dicionário único da dashboard. Cada número deve apontar para uma definição,
 * fórmula, fonte, dono, status e regra semântica explícita.
 */
export const DASHBOARD_METRICS = {
  volumeProcessado: metric({
    id: "volume-processado",
    label: "Volume processado",
    description: "Soma das tentativas aprovadas, pendentes e recusadas.",
    formula: "Aprovado + pendente + recusado",
    source: "Checkout / gateway",
    grain: "Dia",
    owner: "Financeiro",
    direction: "contextual",
    format: "currency",
    unit: "BRL",
    status: "confirmed",
    defaultComparison: "Período anterior",
    semanticRule:
      "Alta não é automaticamente positiva; validar aprovação e liquidação.",
    freshnessSlaMinutes: 5,
    drilldown: "Calendário operacional",
  }),
  caixaRecebido: metric({
    id: "caixa-recebido",
    label: "Caixa recebido",
    description:
      "Valor aprovado usado como aproximação de caixa no modo demonstração.",
    formula: "Pagamentos aprovados; em produção usar valor liquidado",
    source: "Checkout / gateway",
    grain: "Dia",
    owner: "Financeiro",
    direction: "higher",
    format: "currency",
    unit: "BRL",
    status: "provisional",
    defaultComparison: "Período anterior e meta",
    semanticRule:
      "Positivo quando cresce sem deteriorar margem, reembolso ou chargeback.",
    freshnessSlaMinutes: 5,
    drilldown: "Ponte financeira",
  }),
  receitaLiquida: metric({
    id: "receita-liquida",
    label: "Receita líquida",
    description:
      "Receita aprovada descontada de reembolsos, chargebacks e descontos.",
    formula: "Receita aprovada − reembolsos − chargebacks − descontos",
    source: "Checkout + financeiro",
    grain: "Período",
    owner: "Controladoria",
    direction: "higher",
    format: "currency",
    unit: "BRL",
    status: "estimated",
    defaultComparison: "Período anterior e orçamento",
    semanticRule:
      "Positivo quando o ganho supera o crescimento dos custos variáveis.",
    freshnessSlaMinutes: 60,
    drilldown: "Ponte financeira",
  }),
  lucroContribuicao: metric({
    id: "lucro-contribuicao",
    label: "Lucro de contribuição",
    description:
      "O que sobra depois dos custos variáveis associados às vendas.",
    formula:
      "Receita líquida − mídia − taxas − produto − impostos − outros custos variáveis",
    source: "Checkout + mídia + controladoria",
    grain: "Período",
    owner: "FP&A",
    direction: "higher",
    format: "currency",
    unit: "BRL",
    status: "estimated",
    defaultComparison: "Período anterior, meta e orçamento",
    semanticRule: "Principal resultado financeiro da visão executiva.",
    freshnessSlaMinutes: 60,
    drilldown: "Ponte financeira",
  }),
  margemContribuicao: metric({
    id: "margem-contribuicao",
    label: "Margem de contribuição",
    description:
      "Percentual da receita aprovada preservado após custos variáveis.",
    formula: "Lucro de contribuição ÷ receita aprovada",
    source: "Cálculo financeiro",
    grain: "Período",
    owner: "FP&A",
    direction: "higher",
    format: "percent",
    unit: "%",
    status: "estimated",
    defaultComparison: "Período anterior e meta interna",
    semanticRule: "Queda é negativa mesmo quando a receita cresce.",
    freshnessSlaMinutes: 60,
    drilldown: "Ponte financeira",
  }),
  mer: metric({
    id: "mer-blended",
    label: "MER blended",
    description: "Eficiência global da mídia com base de receita declarada.",
    formula: "Caixa recebido ÷ investimento total em mídia",
    source: "Checkout + plataformas de mídia",
    grain: "Período",
    owner: "Growth",
    direction: "higher",
    format: "ratio",
    unit: "x",
    status: "estimated",
    defaultComparison: "Período anterior e meta",
    semanticRule: "Interpretar junto da margem; MER alto não garante lucro.",
    freshnessSlaMinutes: 15,
    drilldown: "Aquisição por canal",
  }),
  roas: metric({
    id: "roas",
    label: "ROAS",
    description: "Receita atribuída à mídia para cada real investido em mídia.",
    formula: "Receita atribuída ÷ investimento em mídia",
    source: "First-party + plataformas de mídia",
    grain: "Canal / campanha / criativo",
    owner: "Growth",
    direction: "higher",
    format: "ratio",
    unit: "x",
    status: "estimated",
    defaultComparison: "Período anterior e meta do canal",
    semanticRule:
      "Não usar como sinônimo de ROI e não somar atribuições duplicadas.",
    freshnessSlaMinutes: 15,
    drilldown: "Campanhas e criativos",
  }),
  roi: metric({
    id: "roi",
    label: "ROI",
    description: "Lucro obtido em relação ao investimento total associado.",
    formula: "Lucro ÷ investimento total",
    source: "Controladoria + mídia",
    grain: "Canal / campanha / período",
    owner: "FP&A",
    direction: "higher",
    format: "percent",
    unit: "%",
    status: "estimated",
    defaultComparison: "Período anterior e custo de capital",
    semanticRule:
      "Denominador deve incluir o investimento total explicitamente definido.",
    freshnessSlaMinutes: 60,
    drilldown: "Aquisição por canal",
  }),
  ncCac: metric({
    id: "nc-cac",
    label: "NC-CAC",
    description: "Custo de mídia para adquirir um cliente novo.",
    formula: "Investimento em mídia ÷ clientes novos",
    source: "Mídia + CRM",
    grain: "Período / canal",
    owner: "Growth",
    direction: "lower",
    format: "currency",
    unit: "BRL/cliente",
    status: "estimated",
    defaultComparison: "Período anterior, meta e LTV",
    semanticRule:
      "Queda é positiva apenas se a qualidade e o LTV não deteriorarem.",
    freshnessSlaMinutes: 60,
    drilldown: "Aquisição por canal",
  }),
  payback: metric({
    id: "payback",
    label: "Payback",
    description: "Tempo ou compras necessárias para recuperar o NC-CAC.",
    formula: "NC-CAC ÷ contribuição por compra antes da mídia",
    source: "Financeiro + CRM",
    grain: "Coorte / canal",
    owner: "FP&A",
    direction: "lower",
    format: "number",
    unit: "compras",
    status: "estimated",
    defaultComparison: "Coorte anterior e meta",
    semanticRule:
      "Menor é melhor, desde que a margem e retenção permaneçam saudáveis.",
    freshnessSlaMinutes: 1440,
    drilldown: "Clientes e coortes",
  }),
  taxaAprovacao: metric({
    id: "taxa-aprovacao",
    label: "Taxa de aprovação",
    description: "Participação do valor aprovado entre pagamentos resolvidos.",
    formula: "Aprovado ÷ (aprovado + recusado)",
    source: "Gateway",
    grain: "Período / método de pagamento",
    owner: "Operações",
    direction: "higher",
    format: "percent",
    unit: "%",
    status: "confirmed",
    defaultComparison: "Mesmo dia da semana e média de 28 dias",
    semanticRule:
      "Queda é negativa e deve ser segmentada por gateway, bandeira e dispositivo.",
    freshnessSlaMinutes: 5,
    drilldown: "Funil de conversão",
  }),
  reembolso: metric({
    id: "taxa-reembolso",
    label: "Taxa de reembolso",
    description: "Percentual da receita aprovada devolvido ao cliente.",
    formula: "Reembolsos ÷ receita aprovada",
    source: "Financeiro",
    grain: "Período / produto / coorte",
    owner: "Customer Success",
    direction: "lower",
    format: "percent",
    unit: "%",
    status: "estimated",
    defaultComparison: "Coorte anterior e média de 90 dias",
    semanticRule: "Alta é negativa e reduz receita líquida e LTV.",
    freshnessSlaMinutes: 1440,
    drilldown: "Clientes e coortes",
  }),
  chargeback: metric({
    id: "taxa-chargeback",
    label: "Taxa de chargeback",
    description: "Percentual da receita aprovada contestado pelo cliente.",
    formula: "Chargebacks ÷ receita aprovada",
    source: "Gateway / adquirente",
    grain: "Período / produto / gateway",
    owner: "Risco",
    direction: "lower",
    format: "percent",
    unit: "%",
    status: "estimated",
    defaultComparison: "Média de 90 dias e limite do adquirente",
    semanticRule: "Alta é crítica mesmo quando o volume vendido cresce.",
    freshnessSlaMinutes: 1440,
    drilldown: "Clientes e risco",
  }),
  ticket: metric({
    id: "ticket-medio",
    label: "Ticket médio",
    description: "Valor médio por pedido aprovado.",
    formula: "Receita aprovada ÷ pedidos aprovados",
    source: "Checkout",
    grain: "Período / produto",
    owner: "Comercial",
    direction: "contextual",
    format: "currency",
    unit: "BRL/pedido",
    status: "confirmed",
    defaultComparison: "Período anterior e mix de produto",
    semanticRule:
      "Alta pode ser positiva, mas deve ser lida com conversão e margem.",
    freshnessSlaMinutes: 5,
    drilldown: "Vendas",
  }),
  ltv90: metric({
    id: "ltv-90",
    label: "LTV 90 dias",
    description: "Valor acumulado por cliente nos primeiros 90 dias.",
    formula: "Receita líquida da coorte em 90 dias ÷ clientes da coorte",
    source: "CRM + pedidos + financeiro",
    grain: "Coorte",
    owner: "CRM",
    direction: "higher",
    format: "currency",
    unit: "BRL/cliente",
    status: "estimated",
    defaultComparison: "Coortes anteriores e canal de aquisição",
    semanticRule: "Interpretar junto de margem, retenção e NC-CAC.",
    freshnessSlaMinutes: 1440,
    drilldown: "Clientes e coortes",
  }),
  dataQuality: metric({
    id: "qualidade-dados",
    label: "Qualidade dos dados",
    description:
      "Completude e frescor ponderados das fontes que alimentam a decisão.",
    formula:
      "Média ponderada de completude, latência, volume e disponibilidade",
    source: "Pipeline de dados",
    grain: "Fonte / período",
    owner: "Analytics Engineering",
    direction: "higher",
    format: "percent",
    unit: "%",
    status: "confirmed",
    defaultComparison: "Última sincronização e SLA",
    semanticRule:
      "Confiança baixa impede automações financeiras e conclusões causais.",
    freshnessSlaMinutes: 5,
    drilldown: "Qualidade e linhagem",
  }),
} satisfies Record<string, MetricDefinition>;

export type DashboardMetricKey = keyof typeof DASHBOARD_METRICS;
