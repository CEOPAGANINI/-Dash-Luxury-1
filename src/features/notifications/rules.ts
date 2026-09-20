import type { ExecutiveSnapshot } from "@/domain/analytics/executive-analytics";
import {
  avaliarGuardrails,
  type ProfitGuardrails,
} from "@/features/guardrails/rules";

/*
  O motor de regras das notificações.

  Até aqui o painel tinha onde guardar avisos e onde mostrá-los, mas ninguém
  decidia quando um aviso nasce. Estas regras são esse "ninguém". Elas leem
  o mesmo retrato que alimenta a Visão geral — os mesmos números, as mesmas
  metas — e devolvem a lista do que merece um aviso agora.

  Cada regra dispara no sinal que avisa antes, não no placar que já mudou:
  chargeback subindo avisa antes de o adquirente ligar; margem caindo avisa
  antes de o mês fechar no vermelho.

  A função é pura. Quem grava no banco é outra camada, e é ela que decide
  não gravar duas vezes o mesmo aviso no mesmo dia.
*/

export type Severidade = "critico" | "atencao" | "informativo";

export interface AvisoGerado {
  /** Estável para o mesmo problema — é o que impede o aviso repetido. */
  chave: string;
  eventType: string;
  severidade: Severidade;
  title: string;
  body: string;
  href: string;
  /** Valor em centavos quando o aviso tem um número de dinheiro. */
  valueCents?: number;
}

const percentual = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const reais = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

/** Os mesmos limites do cartão de pagamentos da Visão geral. */
export const LIMITE_CHARGEBACK = { bom: 0.005, alerta: 0.009, teto: 0.015 };
const APROVACAO_MINIMA = 0.85;
const META_MARGEM = 0.18;

export function avaliarRegras(
  snapshot: ExecutiveSnapshot,
  regras: ProfitGuardrails,
): AvisoGerado[] {
  const avisos: AvisoGerado[] = [];

  /* 1. Chargeback — o único com limite publicado pelas bandeiras. */
  if (snapshot.taxaChargeback >= LIMITE_CHARGEBACK.teto) {
    avisos.push({
      chave: "chargeback-teto",
      eventType: "chargeback",
      severidade: "critico",
      title: `Chargeback em ${percentual(snapshot.taxaChargeback)} — no teto das bandeiras`,
      body: "Acima de 1,5% a conta pode entrar em programa de monitoramento e ser penalizada. Revise as recusas e o atendimento pós-venda hoje.",
      href: "/dashboard",
      valueCents: Math.round(snapshot.chargeback * 100),
    });
  } else if (snapshot.taxaChargeback >= LIMITE_CHARGEBACK.alerta) {
    avisos.push({
      chave: "chargeback-alerta",
      eventType: "chargeback",
      severidade: "atencao",
      title: `Chargeback em ${percentual(snapshot.taxaChargeback)} — acima dos 0,9%`,
      body: "É a faixa em que o adquirente costuma acionar a loja. Vale entender de onde vêm as contestações antes que subam.",
      href: "/dashboard",
      valueCents: Math.round(snapshot.chargeback * 100),
    });
  }

  /* 2. Lucro do período no vermelho. */
  if (snapshot.lucroContribuicao < 0) {
    avisos.push({
      chave: "lucro-negativo",
      eventType: "profit_negative",
      severidade: "critico",
      title: `Período fechou em ${reais(snapshot.lucroContribuicao)}`,
      body: "Depois de mídia, taxas e produto, sobrou menos que zero. O freio de mão pode pausar a verba — confira em Segurança.",
      href: "/seguranca",
      valueCents: Math.round(snapshot.lucroContribuicao * 100),
    });
  }

  /* 3. Margem contra a meta. */
  if (snapshot.margemContribuicao < META_MARGEM * 0.7) {
    avisos.push({
      chave: "margem-critica",
      eventType: "margin_low",
      severidade: "critico",
      title: `Margem em ${percentual(snapshot.margemContribuicao)}, longe da meta de ${percentual(META_MARGEM)}`,
      body: "Abaixo de 70% da meta. Ou a mídia está cara demais, ou o ticket caiu — a Composição financeira mostra qual.",
      href: "/dashboard",
    });
  } else if (snapshot.margemContribuicao < META_MARGEM) {
    avisos.push({
      chave: "margem-abaixo",
      eventType: "margin_low",
      severidade: "atencao",
      title: `Margem em ${percentual(snapshot.margemContribuicao)}, abaixo da meta`,
      body: `Faltam ${percentual(META_MARGEM - snapshot.margemContribuicao)} para a meta de ${percentual(META_MARGEM)}.`,
      href: "/dashboard",
    });
  }

  /* 4. O freio de mão — a decisão que ele tomaria agora. */
  const decisao = avaliarGuardrails(
    {
      gasto: snapshot.gastoMidia,
      receita: snapshot.receitaLiquida,
      lucro: snapshot.lucroContribuicao,
      margem: snapshot.margemContribuicao,
      diasSeguidosNegativos: snapshot.lucroContribuicao < 0 ? 1 : 0,
    },
    regras,
  );
  if (decisao.veredito === "pausar" || decisao.veredito === "reduzir") {
    avisos.push({
      chave: `guardrail-${decisao.veredito}`,
      eventType: "guardrail",
      severidade: decisao.veredito === "pausar" ? "critico" : "atencao",
      title:
        decisao.veredito === "pausar"
          ? "O freio de mão pede pausa na verba"
          : "O freio de mão pede redução na verba",
      body: decisao.motivo,
      href: "/seguranca",
    });
  } else if (decisao.veredito === "escalar" && decisao.exigeAprovacao) {
    avisos.push({
      chave: "guardrail-aprovacao",
      eventType: "guardrail",
      severidade: "informativo",
      title: `Escala de ${reais(decisao.aumentoEmReais)} aguarda aprovação`,
      body: decisao.motivo,
      href: "/seguranca",
      valueCents: Math.round(decisao.aumentoEmReais * 100),
    });
  }

  /* 5. Aprovação de pagamento. */
  if (snapshot.taxaAprovacao < APROVACAO_MINIMA) {
    avisos.push({
      chave: "aprovacao-baixa",
      eventType: "payment_refused",
      severidade: "atencao",
      title: `Aprovação em ${percentual(snapshot.taxaAprovacao)}, abaixo de ${percentual(APROVACAO_MINIMA)}`,
      body: "Muita tentativa recusada. Pode ser antifraude apertado, cartão de baixo limite ou gateway instável — a Saúde dos pagamentos separa os três.",
      href: "/dashboard",
    });
  }

  /* 6. Meta de receita do período. */
  const meta = snapshot.kpis.find((k) => k.key === "net");
  if (meta && meta.goal > 0) {
    const razao = meta.value / meta.goal;
    if (razao < 0.6) {
      avisos.push({
        chave: "meta-receita-longe",
        eventType: "goal_behind",
        severidade: "atencao",
        title: `Receita em ${percentual(razao)} da meta do período`,
        body: `${reais(meta.value)} de ${reais(meta.goal)}. A projeção do mês, na Visão geral, diz onde isso termina neste ritmo.`,
        href: "/dashboard",
        valueCents: Math.round((meta.goal - meta.value) * 100),
      });
    }
  }

  const peso: Record<Severidade, number> = {
    critico: 0,
    atencao: 1,
    informativo: 2,
  };
  return avisos.sort((a, b) => peso[a.severidade] - peso[b.severidade]);
}
