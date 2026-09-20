import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { getGuardrails } from "@/features/guardrails/queries";
import { demoCampaignRows } from "./demo-campaigns";
import { listCampaignTree } from "./queries";
import type { CampaignTree } from "./types";

export type CampaignSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/** Demonstração explícita por padrão: não consulta nem semeia o banco real. */
export async function getCampaignPageData(searchParams: CampaignSearchParams) {
  const { modo } = await searchParams;
  if (modo !== "real") {
    const tree: CampaignTree = {
      campanhas: demoCampaignRows(),
      modo: "demo",
      metaConectado: false,
      ultimaSync: null,
    };
    return { tree, regras: GUARDRAILS_PADRAO };
  }
  const [tree, { regras }] = await Promise.all([
    listCampaignTree(),
    getGuardrails(),
  ]);
  return { tree, regras };
}
