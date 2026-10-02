import {
  DEFAULT_DEMO_SETTINGS,
  DEMO_STORES,
  demoStoreSummary,
} from "@/features/funnel/meta-traffic-demo";
import type { AiTask } from "./model";

export function agentDemoSnapshot(storeIndex: number) {
  const store = DEMO_STORES[storeIndex === 1 ? 1 : 0];
  const result = demoStoreSummary(
    store.loja!.metaBusinessIds!,
    "last_7d",
    DEFAULT_DEMO_SETTINGS,
  );
  const spend = Number(result.metrics.spend),
    purchases = Number(result.metrics.actions?.[0]?.value),
    revenue = Number(result.metrics.action_values?.[0]?.value);
  return {
    name: store.title,
    businesses: store.loja!.metaBusinessIds!.length,
    accounts: result.accounts.length,
    campaigns: result.campaigns.length,
    spend,
    purchases,
    revenue,
    roas: spend ? revenue / spend : 0,
    cpa: purchases ? spend / purchases : 0,
  };
}
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function agentDemoAnswer(
  task: AiTask,
  storeIndex: number,
  prompt: string,
) {
  const s = agentDemoSnapshot(storeIndex);
  const intro = `DEMONSTRAÇÃO • resposta de exemplo, sem chamada a uma IA externa.\n${s.name} • últimos 7 dias fictícios.\n\n`;
  if (task === "campaign")
    return (
      intro +
      `Rascunho de campanha • Vendas / catálogo\nObjetivo: compras no site.\nEstrutura: prospecção ampla (60%), remarketing de visitantes e carrinhos (25%), teste de criativos (15%).\nOrçamento de exemplo: R$ 350/dia por conta, dividido em R$ 210, R$ 87,50 e R$ 52,50. Não representa verba aprovada.\nPúblico de exemplo: Brasil, 25–54 anos; excluir compradores recentes quando fizer sentido.\nMensuração: evento Purchase, Pixel + CAPI com deduplicação por event_id e UTMs.\nCritérios de revisão ilustrativos: ROAS ≥ 2 e CPA ≤ R$ 45, avaliados com volume suficiente.\n\nAntes de publicar: conferir oferta, página, direitos do criativo, estoque, consentimento e vínculo da conta com a BM. Este rascunho não criou anúncio.`
    );
  if (task === "creative")
    return (
      intro +
      `Três roteiros demonstrativos\n\n1. Vídeo UGC • 20 segundos\n0–3s: mostre uma necessidade real do comprador.\n3–12s: demonstre o produto e seus benefícios verificáveis.\n12–17s: detalhe de uso, entrega ou material.\n17–20s: “Conheça a coleção na nossa loja”.\n\n2. Carrossel • 4 cards\nProduto → benefício → detalhe → convite para conhecer.\n\n3. Texto para anúncio\n“Um novo favorito para a sua rotina. Veja os detalhes da coleção e escolha o seu.”\n\nNão inserir descontos, depoimentos, frete grátis ou garantias sem confirmar que a loja oferece isso. São roteiros; imagens e vídeos ainda precisam ser produzidos.`
    );
  if (task === "infrastructure")
    return (
      intro +
      `Checklist demonstrativo de infraestrutura\n\nVercel: conferir domínio de produção, último build e erros de API.\nSupabase: sessão validada no servidor, acesso por operação, RLS e backups conforme o plano contratado.\nCloudflare: confirmar DNS, SSL/TLS e regras compatíveis com a hospedagem. A presença de uma conexão não prova que um domínio esteja protegido.\nPixel/CAPI: verificar eventos, deduplicação e consentimento.\nSegredos: guardar no servidor e criptografar credenciais; nunca em variáveis NEXT_PUBLIC_.\n\nNenhuma checagem real de servidor, DNS ou proteção foi executada. Abra Conexões e APIs, Domínios e Diagnóstico dos serviços para configurar e verificar.`
    );
  return (
    intro +
    `Resumo do tráfego\n${s.businesses} BMs • ${s.accounts} contas de anúncios • ${s.campaigns} campanhas.\nInvestimento: ${money(s.spend)}. Compras atribuídas: ${s.purchases}.\nReceita atribuída: ${money(s.revenue)}. ROAS: ${s.roas.toFixed(2)}x. CPA: ${money(s.cpa)}.\n\nLeitura do cenário fictício\n• Remarketing tem o melhor CPA; verificar tamanho do público antes de escalar.\n• A campanha de teste tem baixo desempenho e aparece pausada; revisar hipótese e criativo.\n${storeIndex === 1 ? "• Uma conta da BM Aurora de testes está restrita; não contar com entrega nessa conta.\n" : ""}• Receita atribuída de anúncios não equivale a lucro; faltam custos, taxas e devoluções.\n\nPróximo passo: comparar campanhas no quadro do funil e conferir Pixel, públicos e criativos.\n\nPedido recebido: ${prompt.slice(0, 180)}\nEste simulador usa respostas por tarefa. Conversas livres estarão disponíveis ao conectar um provedor de IA.`
  );
}
