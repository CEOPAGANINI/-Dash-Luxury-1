import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { paymentProviderAccounts, paymentProviders, payments } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import { metodoDoPagamento, taxaEfetiva, type LinhaDeTaxa, type TaxaMedida } from "./gateway-fees";

/*
  O que o gateway cobrou de verdade: soma o bruto e a taxa dos pagamentos
  aprovados de um período, por forma de pagamento. É daqui que sai a taxa
  do painel — ninguém digita porcentagem.
*/

export interface ContaDeGateway {
  id: string;
  rotulo: string;
  provedor: string;
  chave: string;
  ambiente: string;
  ativa: boolean;
  padrao: boolean;
  metodos: string[];
  ultimoTesteOk: boolean | null;
  ultimoWebhook: Date | null;
}

export interface PanoramaDosGateways {
  /** Há banco configurado: sem ele, nada disto pode ser medido. */
  bancoConfigurado: boolean;
  contas: ContaDeGateway[];
  taxa: TaxaMedida;
  /** Quantos dias de pagamentos entraram na conta. */
  dias: number;
  /** O ticket médio aprovado no período, para converter taxas fixas. */
  ticketCents: number;
}

const VAZIO: PanoramaDosGateways = {
  bancoConfigurado: false,
  contas: [],
  taxa: { percentual: 0, brutoCents: 0, taxaCents: 0, pagamentos: 0, porMetodo: [] },
  dias: 30,
  ticketCents: 0,
};

/** Os gateways conectados e a taxa efetiva medida nos últimos `dias`. */
export async function panoramaDosGateways(dias = 30): Promise<PanoramaDosGateways> {
  if (!isDatabaseConfigured()) return { ...VAZIO, dias };

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const contasCruas = await db
    .select({
      id: paymentProviderAccounts.id,
      rotulo: paymentProviderAccounts.label,
      ambiente: paymentProviderAccounts.environment,
      ativa: paymentProviderAccounts.isActive,
      padrao: paymentProviderAccounts.isDefault,
      metodos: paymentProviderAccounts.enabledMethods,
      ultimoTesteOk: paymentProviderAccounts.lastConnectionOk,
      ultimoWebhook: paymentProviderAccounts.lastWebhookAt,
      provedor: paymentProviders.name,
      chave: paymentProviders.key,
    })
    .from(paymentProviderAccounts)
    .innerJoin(paymentProviders, eq(paymentProviders.id, paymentProviderAccounts.providerId))
    .where(eq(paymentProviderAccounts.workspaceId, workspaceId));

  const contas: ContaDeGateway[] = contasCruas.map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
    provedor: c.provedor,
    chave: c.chave,
    ambiente: c.ambiente,
    ativa: c.ativa,
    padrao: c.padrao,
    metodos: Array.isArray(c.metodos) ? (c.metodos as string[]) : [],
    ultimoTesteOk: c.ultimoTesteOk,
    ultimoWebhook: c.ultimoWebhook,
  }));

  /* Só pagamentos que entraram mesmo: os aprovados/pagos do período. */
  const linhasCruas = await db
    .select({
      metodo: payments.method,
      pagamentos: sql<number>`count(*)::int`,
      brutoCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::bigint`,
      taxaCents: sql<number>`coalesce(sum(${payments.feeCents}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.workspaceId, workspaceId),
        inArray(payments.status, ["approved", "partially_refunded"]),
        gte(payments.createdAt, desde),
      ),
    )
    .groupBy(payments.method);

  const linhas: LinhaDeTaxa[] = linhasCruas.map((l) => ({
    metodo: metodoDoPagamento(l.metodo),
    pagamentos: Number(l.pagamentos ?? 0),
    brutoCents: Number(l.brutoCents ?? 0),
    taxaCents: Number(l.taxaCents ?? 0),
  }));

  const taxa = taxaEfetiva(linhas);
  return {
    bancoConfigurado: true,
    contas,
    taxa,
    dias,
    ticketCents: taxa.pagamentos > 0 ? Math.round(taxa.brutoCents / taxa.pagamentos) : 0,
  };
}
