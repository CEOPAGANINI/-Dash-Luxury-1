"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { adCampaigns, adChangeLog, adSets, ads } from "@/database/schema";
import { getGuardrails } from "@/features/guardrails/queries";
import {
  avaliarGuardrails,
  type Decisao,
  type ProfitGuardrails,
} from "@/features/guardrails/rules";
import { getSession } from "@/lib/auth/session";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  createMetaCampaign,
  getMetaCredentials,
  updateMetaObject,
} from "./meta-client";
import { isCampaignClass, type CampaignClassId } from "./campaign-classes";
import { demoCampaignRows } from "./demo-campaigns";
import { getAdEntity, syncFromMeta } from "./queries";
import { ensureAdsSchema, mensagemDeErro } from "./schema-guard";
import {
  OBJETIVOS,
  derivadas,
  isAdNetwork,
  isAdStatus,
  type AdEntityType,
  type AdMetrics,
  type AdStatus,
} from "./types";

/*
  As ações do gerenciador.

  A regra da casa: quem mexe em dinheiro passa pelo freio de mão. Subir
  orçamento só quando ele diz "escalar", dentro do aumento que ele libera;
  acima do valor de aprovação, a pessoa marca "aprovo" — é a aprovação
  humana. Pausar e reduzir são sempre permitidos: freio nunca impede de
  frear.

  E a ordem é: plataforma primeiro, banco depois. Se o Meta recusar, nada
  muda aqui — a tela não pode mostrar um orçamento que não existe lá.
*/

export interface ResultadoAds {
  ok: boolean;
  mensagem: string;
  /** Identifies a newly created campaign for browser-local organization. */
  campaignId?: string;
  /** Verdadeiro quando falta a pessoa marcar "aprovo" para o aumento. */
  pedeAprovacao?: boolean;
}

const SEM_BANCO: ResultadoAds = {
  ok: false,
  mensagem:
    "Sem banco de dados, a edição não fica salva. Configure o Supabase na Vercel.",
};

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

function ehTipo(v: unknown): v is AdEntityType {
  return v === "campaign" || v === "ad_set" || v === "ad";
}

async function ator() {
  const session = await getSession();
  return session?.user.email ?? "desconhecido";
}

/** O que o freio de mão diz sobre esta entidade, pelos últimos 7 dias. */
function decisaoPara(metrics: AdMetrics, regras: ProfitGuardrails): Decisao {
  const gasto = metrics.spendCents / 100;
  const receita = metrics.revenueCents / 100;
  const lucro = receita - gasto;
  return avaliarGuardrails(
    {
      gasto,
      receita,
      lucro,
      margem: derivadas(metrics).margem ?? 0,
      diasSeguidosNegativos: lucro < 0 ? 1 : 0,
    },
    regras,
  );
}

async function registrar(entrada: {
  workspaceId: string;
  entityType: AdEntityType;
  entityId: string;
  entityName: string;
  field: string;
  before: string | null;
  after: string | null;
  decision?: Decisao | null;
  appliedRemote: boolean;
  error?: string | null;
}) {
  try {
    await getDb()
      .insert(adChangeLog)
      .values({ ...entrada, decision: entrada.decision ?? null, actor: await ator() });
  } catch (error) {
    console.error("[ads] diário falhou:", error);
  }
}

/** Puxa tudo do Meta para o banco. */
export async function syncMetaAction(): Promise<ResultadoAds> {
  if (!isDatabaseConfigured()) return SEM_BANCO;
  const credenciais = await getMetaCredentials();
  if (!credenciais) {
    return {
      ok: false,
      mensagem:
        "O Meta não está conectado. Conecte em Integrações (com uma conta act_…) e volte.",
    };
  }
  try {
    await ensureAdsSchema();
    const r = await syncFromMeta(credenciais);
    revalidatePath("/campanhas", "layout");
    return {
      ok: true,
      mensagem: `Sincronizado: ${r.campanhas} campanha(s), ${r.conjuntos} conjunto(s), ${r.anuncios} anúncio(s).`,
    };
  } catch (error) {
    console.error("[ads] sync falhou:", error);
    return {
      ok: false,
      mensagem: `O Meta recusou: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
    };
  }
}

/**
 * Edita nome, estado e orçamento diário de uma campanha, conjunto ou
 * anúncio. Um formulário só para os três — o tipo vai no campo `tipo`.
 */
export async function updateAdEntityAction(
  _anterior: ResultadoAds | null,
  formData: FormData,
): Promise<ResultadoAds> {
  try {
    return await editarEntidade(formData);
  } catch (error) {
    console.error("[ads] edição falhou:", error);
    return { ok: false, mensagem: mensagemDeErro(error) };
  }
}

async function editarEntidade(formData: FormData): Promise<ResultadoAds> {
  const tipo = formData.get("tipo");
  const id = String(formData.get("id") ?? "");
  if (!ehTipo(tipo) || !id) return { ok: false, mensagem: "Item desconhecido." };
  if (id.startsWith("demo-")) {
    return {
      ok: false,
      mensagem:
        "Esta é uma campanha de demonstração. Conecte o Meta e sincronize para editar campanhas reais.",
    };
  }
  if (!isDatabaseConfigured()) return SEM_BANCO;

  const atual = await getAdEntity(tipo, id);
  if (!atual) return { ok: false, mensagem: "Item não encontrado." };

  const nome = String(formData.get("name") ?? atual.name).trim().slice(0, 200);
  const statusBruto = formData.get("status");
  const status: AdStatus = isAdStatus(statusBruto)
    ? statusBruto
    : isAdStatus(atual.status)
      ? atual.status
      : "paused";
  const orcamentoBruto = formData.get("dailyBudget");
  const orcamentoReais =
    tipo === "ad" || orcamentoBruto === null || orcamentoBruto === ""
      ? null
      : Number(String(orcamentoBruto).replace(",", "."));
  const orcamentoCents =
    orcamentoReais === null || !Number.isFinite(orcamentoReais)
      ? atual.dailyBudgetCents
      : Math.max(0, Math.round(orcamentoReais * 100));
  const aprovado = formData.get("aprovado") === "on";

  if (!nome) return { ok: false, mensagem: "O nome não pode ficar vazio." };

  /* O freio de mão entra quando a mudança pede mais dinheiro: orçamento
     subindo, ou uma campanha voltando a rodar. */
  const { regras } = await getGuardrails();
  let decision: Decisao | null = null;
  const sobeOrcamento =
    orcamentoCents !== null &&
    atual.dailyBudgetCents !== null &&
    orcamentoCents > atual.dailyBudgetCents;
  const reativa = status === "active" && atual.status !== "active";

  if (sobeOrcamento || reativa) {
    decision = decisaoPara(atual.metrics, regras);
    const temHistorico = atual.metrics.spendCents > 0;

    if (reativa && temHistorico && decision.veredito === "pausar") {
      return {
        ok: false,
        mensagem: `O freio de mão pede pausa: ${decision.motivo}`,
      };
    }
    if (sobeOrcamento && temHistorico) {
      if (decision.veredito !== "escalar") {
        return {
          ok: false,
          mensagem: `O freio de mão não libera aumento (${decision.veredito}): ${decision.motivo}`,
        };
      }
      const aumento = orcamentoCents! - atual.dailyBudgetCents!;
      const maximo = Math.round(atual.dailyBudgetCents! * decision.escalaPermitida);
      if (aumento > maximo) {
        return {
          ok: false,
          mensagem: `O freio libera até ${reais(maximo)} a mais por dia (${Math.round(decision.escalaPermitida * 100)}%). Tente até ${reais(atual.dailyBudgetCents! + maximo)}.`,
        };
      }
      if (regras.aprovacaoAcimaDe > 0 && aumento / 100 > regras.aprovacaoAcimaDe && !aprovado) {
        return {
          ok: false,
          pedeAprovacao: true,
          mensagem: `Aumento de ${reais(aumento)}/dia passa de ${reais(regras.aprovacaoAcimaDe * 100)}: marque "Aprovo este aumento" para confirmar.`,
        };
      }
    }
  }

  /* Plataforma primeiro. */
  let appliedRemote = false;
  if (atual.externalId) {
    const credenciais = await getMetaCredentials();
    if (!credenciais) {
      return {
        ok: false,
        mensagem:
          "Este item vive no Meta e a conexão não está ativa. Reconecte o Meta em Integrações.",
      };
    }
    try {
      await updateMetaObject(
        atual.externalId,
        {
          name: nome !== atual.name ? nome : undefined,
          status: status !== atual.status ? status : undefined,
          dailyBudgetCents:
            tipo !== "ad" && orcamentoCents !== null && orcamentoCents !== atual.dailyBudgetCents
              ? orcamentoCents
              : undefined,
        },
        credenciais.token,
      );
      appliedRemote = true;
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "erro desconhecido";
      await registrar({
        workspaceId: await getOrCreateDefaultWorkspace(),
        entityType: tipo,
        entityId: id,
        entityName: atual.name,
        field: "update",
        before: null,
        after: null,
        decision,
        appliedRemote: false,
        error: mensagem,
      });
      return { ok: false, mensagem: `O Meta recusou a mudança: ${mensagem}` };
    }
  }

  /* Banco depois. */
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const agora = new Date();
  const set = {
    name: nome,
    status,
    updatedAt: agora,
    ...(tipo !== "ad" ? { dailyBudgetCents: orcamentoCents } : {}),
  };
  if (tipo === "campaign") {
    await db.update(adCampaigns).set(set).where(and(eq(adCampaigns.id, id), eq(adCampaigns.workspaceId, workspaceId)));
  } else if (tipo === "ad_set") {
    await db.update(adSets).set(set).where(and(eq(adSets.id, id), eq(adSets.workspaceId, workspaceId)));
  } else {
    await db.update(ads).set({ name: nome, status, updatedAt: agora }).where(and(eq(ads.id, id), eq(ads.workspaceId, workspaceId)));
  }

  const mudancas: [string, string | null, string | null][] = [];
  if (nome !== atual.name) mudancas.push(["name", atual.name, nome]);
  if (status !== atual.status) mudancas.push(["status", atual.status, status]);
  if (tipo !== "ad" && orcamentoCents !== atual.dailyBudgetCents) {
    mudancas.push([
      "daily_budget",
      atual.dailyBudgetCents === null ? null : String(atual.dailyBudgetCents),
      orcamentoCents === null ? null : String(orcamentoCents),
    ]);
  }
  for (const [field, before, after] of mudancas) {
    await registrar({
      workspaceId,
      entityType: tipo,
      entityId: id,
      entityName: nome,
      field,
      before,
      after,
      decision: field === "daily_budget" || field === "status" ? decision : null,
      appliedRemote,
    });
  }

  revalidatePath("/campanhas", "layout");
  return {
    ok: true,
    mensagem:
      mudancas.length === 0
        ? "Nada mudou."
        : appliedRemote
          ? "Salvo — e aplicado no Meta."
          : "Salvo.",
  };
}

/** Cria uma campanha (pausada) — no Meta, se conectado, e no banco. */
export async function createCampaignAction(
  _anterior: ResultadoAds | null,
  formData: FormData,
): Promise<ResultadoAds> {
  if (!isDatabaseConfigured()) return SEM_BANCO;
  try {
    await ensureAdsSchema();
    return await criarCampanha(formData);
  } catch (error) {
    console.error("[ads] criação falhou:", error);
    return { ok: false, mensagem: mensagemDeErro(error) };
  }
}

async function criarCampanha(formData: FormData): Promise<ResultadoAds> {

  const nome = String(formData.get("name") ?? "").trim().slice(0, 200);
  const rede = formData.get("network");
  const objetivo = String(formData.get("objective") ?? "Vendas");
  const orcamentoReais = Number(String(formData.get("dailyBudget") ?? "").replace(",", "."));
  const classeBruta = formData.get("campaignClass");
  if (!nome) return { ok: false, mensagem: "Dê um nome à campanha." };
  if (!isAdNetwork(rede)) return { ok: false, mensagem: "Escolha a rede." };
  if (!(OBJETIVOS as readonly string[]).includes(objetivo)) {
    return { ok: false, mensagem: "Escolha o objetivo." };
  }
  if (!Number.isFinite(orcamentoReais) || orcamentoReais <= 0) {
    return { ok: false, mensagem: "Informe o orçamento diário em reais." };
  }
  const dailyBudgetCents = Math.round(orcamentoReais * 100);

  const { regras } = await getGuardrails();
  if (regras.gastoMaximoDia > 0 && orcamentoReais > regras.gastoMaximoDia) {
    return {
      ok: false,
      mensagem: `O teto diário do freio de mão é ${reais(regras.gastoMaximoDia * 100)}. Reduza o orçamento ou ajuste a regra em Segurança.`,
    };
  }

  let externalId: string | null = null;
  let source: "manual" | "meta" = "manual";
  if (rede === "meta") {
    const credenciais = await getMetaCredentials();
    if (credenciais) {
      try {
        externalId = await createMetaCampaign(credenciais, {
          name: nome,
          objective: objetivo,
          dailyBudgetCents,
        });
        source = "meta";
      } catch (error) {
        return {
          ok: false,
          mensagem: `O Meta recusou a criação: ${error instanceof Error ? error.message : "erro desconhecido"}`,
        };
      }
    }
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const [row] = await db
    .insert(adCampaigns)
    .values({
      workspaceId,
      network: rede,
      externalId,
      name: nome,
      objective: objetivo,
      status: "paused",
      dailyBudgetCents,
      source,
      campaignClass: isCampaignClass(classeBruta) ? classeBruta : null,
    })
    .returning({ id: adCampaigns.id });

  await registrar({
    workspaceId,
    entityType: "campaign",
    entityId: row.id,
    entityName: nome,
    field: "created",
    before: null,
    after: String(dailyBudgetCents),
    appliedRemote: source === "meta",
  });

  revalidatePath("/campanhas", "layout");
  return {
    ok: true,
    campaignId: row.id,
    mensagem:
      source === "meta"
        ? "Campanha criada no Meta, pausada. Ative quando os conjuntos e anúncios estiverem prontos."
        : "Campanha criada aqui, pausada. Sem conexão com a rede, ela ainda não existe na plataforma.",
  };
}

/**
 * Carrega as doze campanhas de exemplo no banco, como campanhas "só aqui"
 * (sem id na plataforma), para dar o que editar antes da primeira
 * sincronização. Roda uma vez: se já existe uma campanha de exemplo, não
 * duplica.
 */
export async function seedDemoCampaignsAction(): Promise<ResultadoAds> {
  if (!isDatabaseConfigured()) return SEM_BANCO;
  try {
    await ensureAdsSchema();
    return await carregarExemplos();
  } catch (error) {
    console.error("[ads] carregar exemplos falhou:", error);
    return { ok: false, mensagem: mensagemDeErro(error) };
  }
}

async function carregarExemplos(): Promise<ResultadoAds> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const [existente] = await db
    .select({ id: adCampaigns.id })
    .from(adCampaigns)
    .where(and(eq(adCampaigns.workspaceId, workspaceId), eq(adCampaigns.objective, EXEMPLO_MARCA)))
    .limit(1);
  if (existente) {
    return { ok: false, mensagem: "As campanhas de exemplo já estão carregadas." };
  }

  let conjuntos = 0;
  let anuncios = 0;
  for (const c of demoCampaignRows()) {
    const [campanha] = await db
      .insert(adCampaigns)
      .values({
        workspaceId,
        network: c.network,
        externalId: null,
        name: `${c.name} (exemplo)`,
        objective: EXEMPLO_MARCA,
        status: c.status,
        dailyBudgetCents: c.dailyBudgetCents,
        source: "manual",
        ...c.metrics,
        syncedAt: new Date(),
      })
      .returning({ id: adCampaigns.id });
    for (const s of c.adSets) {
      const [conjunto] = await db
        .insert(adSets)
        .values({
          workspaceId,
          campaignId: campanha.id,
          externalId: null,
          name: s.name,
          status: s.status,
          dailyBudgetCents: s.dailyBudgetCents,
          ...s.metrics,
          syncedAt: new Date(),
        })
        .returning({ id: adSets.id });
      conjuntos += 1;
      for (const a of s.ads) {
        await db.insert(ads).values({
          workspaceId,
          adSetId: conjunto.id,
          externalId: null,
          name: a.name,
          status: a.status,
          creative: a.creative,
          ...a.metrics,
          syncedAt: new Date(),
        });
        anuncios += 1;
      }
    }
  }

  revalidatePath("/campanhas", "layout");
  return {
    ok: true,
    mensagem: `Carregadas 12 campanhas de exemplo, ${conjuntos} conjuntos e ${anuncios} anúncios. Edite à vontade — nada disso existe na plataforma.`,
  };
}

/** O objetivo que marca uma campanha como exemplo carregado. */
const EXEMPLO_MARCA = "Exemplo";

/**
 * Pausa ou ativa várias campanhas de uma vez — a barra de seleção do
 * quadro. Cada uma passa pelo mesmo freio de mão da edição individual;
 * a resposta diz quantas mudaram e quantas foram barradas.
 */
export async function bulkStatusAction(
  ids: string[],
  status: AdStatus,
): Promise<ResultadoAds> {
  if (!isDatabaseConfigured()) return SEM_BANCO;
  if (!isAdStatus(status) || ids.length === 0) {
    return { ok: false, mensagem: "Nada selecionado." };
  }
  let ok = 0;
  const barradas: string[] = [];
  for (const id of ids.slice(0, 100)) {
    const fd = new FormData();
    fd.set("tipo", "campaign");
    fd.set("id", id);
    fd.set("status", status);
    try {
      const r = await editarEntidade(fd);
      if (r.ok) ok += 1;
      else barradas.push(r.mensagem);
    } catch (error) {
      barradas.push(mensagemDeErro(error));
    }
  }
  revalidatePath("/campanhas");
  const verbo = status === "active" ? "ativada(s)" : status === "paused" ? "pausada(s)" : "arquivada(s)";
  return {
    ok: ok > 0,
    mensagem:
      barradas.length === 0
        ? `${ok} campanha(s) ${verbo}.`
        : `${ok} ${verbo}; ${barradas.length} barrada(s): ${barradas[0]}`,
  };
}

/** Muda a classe de trabalho de uma campanha (só organização; a rede não vê). */
export async function setCampaignClassAction(
  id: string,
  classe: CampaignClassId,
): Promise<ResultadoAds> {
  if (!isDatabaseConfigured()) return SEM_BANCO;
  if (!id || !isCampaignClass(classe)) return { ok: false, mensagem: "Classe desconhecida." };
  if (id.startsWith("demo-")) {
    return { ok: false, mensagem: "Campanha de demonstração: a classe fica só neste navegador." };
  }
  try {
    await ensureAdsSchema();
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const [atual] = await db
      .select({ name: adCampaigns.name, campaignClass: adCampaigns.campaignClass })
      .from(adCampaigns)
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.workspaceId, workspaceId)))
      .limit(1);
    if (!atual) return { ok: false, mensagem: "Campanha não encontrada." };
    await db
      .update(adCampaigns)
      .set({ campaignClass: classe, updatedAt: new Date() })
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.workspaceId, workspaceId)));
    await registrar({
      workspaceId,
      entityType: "campaign",
      entityId: id,
      entityName: atual.name,
      field: "class",
      before: atual.campaignClass ?? null,
      after: classe,
      appliedRemote: false,
    });
    revalidatePath("/campanhas", "layout");
    return { ok: true, mensagem: "Classe salva." };
  } catch (error) {
    console.error("[ads] classe falhou:", error);
    return { ok: false, mensagem: mensagemDeErro(error) };
  }
}
