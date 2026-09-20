import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customerAddresses, customers, orders } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import type { CustomerRow } from "./queries";

/*
  CRM.

  A lista de clientes já existia; o que faltava era ler dela como um CRM lê:
  em quem vale investir agora. Um segmento por cliente, calculado dos
  próprios pedidos — nada cadastrado à mão, então nunca fica desatualizado.

  A ordem das regras importa: um cliente que tentou e nunca pagou é "risco"
  antes de ser qualquer outra coisa; um que já comprou mas sumiu é "inativo"
  mesmo que tenha sido VIP um dia. Cada segmento carrega a pergunta que ele
  responde, para a tela não precisar explicar de novo.
*/
export type Segmento =
  "vip" | "recorrente" | "novo" | "inativo" | "risco" | "lead";

export const SEGMENTOS: Record<
  Segmento,
  { label: string; pergunta: string; tom: "success" | "info" | "warning" | "destructive" | "muted" }
> = {
  vip: {
    label: "VIP",
    pergunta: "Quem mais gasta — vale atendimento e oferta especial.",
    tom: "success",
  },
  recorrente: {
    label: "Recorrente",
    pergunta: "Já comprou mais de uma vez — a base que sustenta a operação.",
    tom: "info",
  },
  novo: {
    label: "Novo",
    pergunta: "Primeira compra nos últimos 30 dias — a hora de conquistar a segunda.",
    tom: "success",
  },
  inativo: {
    label: "Inativo",
    pergunta: "Comprou, mas há mais de 90 dias sem voltar — campanha de retorno.",
    tom: "warning",
  },
  risco: {
    label: "Risco",
    pergunta: "Tentou comprar e nunca pagou — recuperação de carrinho ou bloqueio.",
    tom: "destructive",
  },
  lead: {
    label: "Lead",
    pergunta: "Deixou o e-mail e ainda não tentou comprar.",
    tom: "muted",
  },
};

export const ORDEM_SEGMENTOS: Segmento[] = [
  "vip",
  "recorrente",
  "novo",
  "inativo",
  "risco",
  "lead",
];

const DIA = 86_400_000;
/** Gasto acumulado a partir do qual um cliente é VIP, em centavos (R$ 500). */
const VIP_GASTO_CENTS = 50_000;
const VIP_COMPRAS = 3;

export function segmentar(c: CustomerRow, agora = Date.now()): Segmento {
  if (c.orderCount === 0) return "lead";
  if (c.paidCount === 0) return "risco";

  const diasDesdeUltima = c.lastOrderAt
    ? (agora - c.lastOrderAt.getTime()) / DIA
    : Infinity;
  if (diasDesdeUltima > 90) return "inativo";
  if (c.paidCount >= VIP_COMPRAS || c.totalSpentCents >= VIP_GASTO_CENTS)
    return "vip";
  if (c.paidCount >= 2) return "recorrente";
  if (diasDesdeUltima <= 30) return "novo";
  return "recorrente";
}

export function contarSegmentos(rows: CustomerRow[]) {
  const contagem = Object.fromEntries(
    ORDEM_SEGMENTOS.map((s) => [s, 0]),
  ) as Record<Segmento, number>;
  for (const row of rows) contagem[segmentar(row)] += 1;
  return contagem;
}

export interface PedidoDoCliente {
  id: string;
  reference: string;
  status: string;
  totalCents: number;
  createdAt: Date;
  origin: string | null;
}

export interface EnderecoDoCliente {
  label: string | null;
  city: string | null;
  state: string | null;
  country: string;
}

export interface FichaDoCliente {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  tags: string[];
  notes: string | null;
  isBlocked: boolean;
  marketingOptOut: boolean;
  createdAt: Date;
  pedidos: PedidoDoCliente[];
  enderecos: EnderecoDoCliente[];
}

/** A ficha completa: perfil, pedidos e endereços. Null se não existir. */
export async function getFichaDoCliente(
  id: string,
): Promise<FichaDoCliente | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [perfil] = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      country: customers.country,
      tags: customers.tags,
      notes: customers.notes,
      isBlocked: customers.isBlocked,
      marketingOptOut: customers.marketingOptOut,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.id, id),
        eq(customers.workspaceId, workspaceId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);

  if (!perfil) return null;

  const [pedidos, enderecos] = await Promise.all([
    db
      .select({
        id: orders.id,
        reference: orders.reference,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
        origin: orders.origin,
      })
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select({
        label: customerAddresses.label,
        city: customerAddresses.city,
        state: customerAddresses.state,
        country: customerAddresses.country,
      })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, id))
      .limit(10),
  ]);

  return {
    id: perfil.id,
    name:
      [perfil.firstName, perfil.lastName].filter(Boolean).join(" ") ||
      perfil.email,
    email: perfil.email,
    phone: perfil.phone,
    country: perfil.country,
    tags: Array.isArray(perfil.tags)
      ? (perfil.tags as unknown[]).map(String)
      : [],
    notes: perfil.notes,
    isBlocked: perfil.isBlocked,
    marketingOptOut: perfil.marketingOptOut,
    createdAt: perfil.createdAt,
    pedidos: pedidos.map((p) => ({
      ...p,
      status: String(p.status),
      totalCents: Number(p.totalCents),
    })),
    enderecos,
  };
}

/** Pedidos que contam como receita — a mesma régua da lista de clientes. */
export const STATUS_PAGOS = new Set(["paid", "shipped", "delivered"]);
