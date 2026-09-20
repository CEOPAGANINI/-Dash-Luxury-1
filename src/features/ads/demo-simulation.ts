import { z } from "zod";
import {
  avaliarGuardrails,
  type ProfitGuardrails,
} from "@/features/guardrails/rules";
import type { ResultadoAds } from "./actions";
import {
  METRICAS_ZERADAS,
  OBJETIVOS,
  derivadas,
  isAdNetwork,
  isAdStatus,
  type CampaignRow,
} from "./types";

// Somente dados fictícios podem ser restaurados do armazenamento do navegador.
const metricSchema = z.object({
  spendCents: z.number().int().nonnegative(),
  revenueCents: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  purchases: z.number().int().nonnegative(),
});
const entitySchema = z.object({
  id: z.string().startsWith("demo-"),
  externalId: z.null(),
  name: z.string().min(1).max(200),
  status: z.enum(["active", "paused", "archived"]),
  metrics: metricSchema,
});
const budgetSchema = z.number().int().nonnegative().max(100_000_000).nullable();
const adSchema = entitySchema.extend({
  creative: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
  }),
});
const groupSchema = entitySchema.extend({
  dailyBudgetCents: budgetSchema,
  ads: z.array(adSchema).max(100),
});
const campaignSchema = entitySchema.extend({
  network: z.enum(["meta", "google", "youtube"]),
  source: z.literal("demo"),
  syncedAt: z.null(),
  objective: z.string().nullable(),
  dailyBudgetCents: budgetSchema,
  adSets: z.array(groupSchema).max(100),
});
const storageSchema = z.object({
  version: z.literal(1),
  rows: z.array(campaignSchema).max(200),
});

export function restoreDemoRows(raw: string): CampaignRow[] | null {
  try {
    const result = storageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.rows : null;
  } catch {
    return null;
  }
}

type SimulationResult = { rows: CampaignRow[]; result: ResultadoAds };
const failure = (
  rows: CampaignRow[],
  mensagem: string,
  pedeAprovacao = false,
): SimulationResult => ({
  rows,
  result: { ok: false, mensagem, pedeAprovacao },
});

function budgetFrom(form: FormData) {
  const raw = form.get("dailyBudget");
  if (raw === null || raw === "") return null;
  const value = Number(String(raw).replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000
    ? Math.round(value * 100)
    : NaN;
}

export function createDemoCampaign(
  rows: CampaignRow[],
  form: FormData,
  id: string,
  regras: ProfitGuardrails,
): SimulationResult {
  const name = String(form.get("name") ?? "").trim();
  const network = form.get("network");
  const objective = String(form.get("objective") ?? "Vendas");
  const budget = budgetFrom(form);
  if (!name || name.length > 200)
    return failure(rows, "Informe um nome de até 200 caracteres.");
  if (!isAdNetwork(network) || !OBJETIVOS.some((o) => o === objective))
    return failure(rows, "Rede ou objetivo inválido.");
  if (budget === null || !Number.isFinite(budget) || budget <= 0)
    return failure(
      rows,
      "Informe um orçamento maior que zero, até R$ 1 milhão.",
    );
  if (regras.gastoMaximoDia > 0 && budget / 100 > regras.gastoMaximoDia)
    return failure(rows, "O orçamento ultrapassa o teto diário da simulação.");
  if (
    !id.startsWith("demo-") ||
    rows.some((row) => row.id === id) ||
    rows.length >= 200
  )
    return failure(
      rows,
      "Limite da demonstração atingido. Restaure os exemplos para recomeçar.",
    );
  return {
    rows: [
      {
        id,
        externalId: null,
        name,
        network,
        objective,
        dailyBudgetCents: budget,
        status: "paused",
        source: "demo",
        syncedAt: null,
        metrics: { ...METRICAS_ZERADAS },
        adSets: [],
      },
      ...rows,
    ],
    result: {
      ok: true,
      campaignId: id,
      mensagem:
        "Campanha fictícia criada pausada. Nenhum anúncio foi publicado.",
    },
  };
}

export function updateDemoEntity(
  rows: CampaignRow[],
  form: FormData,
  regras: ProfitGuardrails,
): SimulationResult {
  const id = String(form.get("id") ?? "");
  const tipo = form.get("tipo");
  const entities =
    tipo === "campaign"
      ? rows
      : tipo === "ad_set"
        ? rows.flatMap((c) => c.adSets)
        : tipo === "ad"
          ? rows.flatMap((c) => c.adSets.flatMap((s) => s.ads))
          : [];
  const current = entities.find((entity) => entity.id === id);
  if (!id.startsWith("demo-") || !current)
    return failure(rows, "Item fictício não encontrado.");
  const name = String(form.get("name") ?? current.name).trim();
  const status = form.get("status") ?? current.status;
  const previousBudget =
    "dailyBudgetCents" in current ? current.dailyBudgetCents : null;
  const budget = tipo === "ad" ? null : (budgetFrom(form) ?? previousBudget);
  if (!name || name.length > 200)
    return failure(rows, "Informe um nome de até 200 caracteres.");
  if (!isAdStatus(status)) return failure(rows, "Estado inválido.");
  if (budget !== null && !Number.isFinite(budget))
    return failure(
      rows,
      "Orçamento inválido. Use um valor entre zero e R$ 1 milhão.",
    );
  const increase = budget !== null && budget > (previousBudget ?? 0);
  const reactivate = status === "active" && current.status !== "active";
  if (increase || reactivate) {
    const m = current.metrics;
    const decision = avaliarGuardrails(
      {
        gasto: m.spendCents / 100,
        receita: m.revenueCents / 100,
        lucro: (m.revenueCents - m.spendCents) / 100,
        margem: derivadas(m).margem ?? 0,
        diasSeguidosNegativos: m.revenueCents < m.spendCents ? 1 : 0,
      },
      regras,
    );
    if (reactivate && m.spendCents > 0 && decision.veredito === "pausar")
      return failure(
        rows,
        `Simulação bloqueada pelos limites de segurança: ${decision.motivo}`,
      );
    if (increase && m.spendCents > 0) {
      if (decision.veredito !== "escalar")
        return failure(
          rows,
          `Aumento não liberado na simulação: ${decision.motivo}`,
        );
      if (
        previousBudget !== null &&
        budget! - previousBudget >
          Math.round(previousBudget * decision.escalaPermitida)
      )
        return failure(
          rows,
          `Aumento acima do limite simulado de ${Math.round(decision.escalaPermitida * 100)}%.`,
        );
    }
    if (
      increase &&
      regras.gastoMaximoDia > 0 &&
      budget! / 100 > regras.gastoMaximoDia
    )
      return failure(
        rows,
        "O orçamento ultrapassa o teto diário da simulação.",
      );
    if (
      increase &&
      regras.aprovacaoAcimaDe > 0 &&
      (budget! - (previousBudget ?? 0)) / 100 > regras.aprovacaoAcimaDe &&
      form.get("aprovado") !== "on"
    )
      return failure(
        rows,
        "Marque a aprovação para testar este aumento de orçamento. Não haverá gasto real.",
        true,
      );
  }
  const patch = { name, status };
  return {
    rows: rows.map((campaign) => {
      if (tipo === "campaign" && campaign.id === id)
        return { ...campaign, ...patch, dailyBudgetCents: budget };
      return {
        ...campaign,
        adSets: campaign.adSets.map((group) => {
          if (tipo === "ad_set" && group.id === id)
            return { ...group, ...patch, dailyBudgetCents: budget };
          return {
            ...group,
            ads: group.ads.map((ad) =>
              tipo === "ad" && ad.id === id ? { ...ad, ...patch } : ad,
            ),
          };
        }),
      };
    }),
    result: {
      ok: true,
      mensagem: "Alteração simulada. Nenhuma conta de anúncios foi alterada.",
    },
  };
}
