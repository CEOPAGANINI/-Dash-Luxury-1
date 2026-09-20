import { eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { workspaces } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  GUARDRAILS_PADRAO,
  normalizarGuardrails,
  type ProfitGuardrails,
} from "./rules";

/** A chave dentro de `workspaces.settings` onde as regras moram. */
export const GUARDRAILS_SETTINGS_KEY = "profitGuardrails";

/**
 * As regras do workspace. Sem banco, valem os padrões — e a página diz
 * isso, em vez de fingir que salvou.
 *
 * As regras vivem no jsonb de configurações do workspace, e não numa tabela
 * própria: são oito números que mudam raramente, e assim não foi preciso
 * nova migração para o freio de mão existir.
 */
export async function getGuardrails(): Promise<{
  regras: ProfitGuardrails;
  persistidas: boolean;
}> {
  if (!isDatabaseConfigured()) {
    return { regras: GUARDRAILS_PADRAO, persistidas: false };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const [row] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const settings = (row?.settings ?? {}) as Record<string, unknown>;
    const salvas = settings[GUARDRAILS_SETTINGS_KEY];
    if (!salvas || typeof salvas !== "object") {
      return { regras: GUARDRAILS_PADRAO, persistidas: false };
    }
    return {
      regras: normalizarGuardrails(salvas as Partial<ProfitGuardrails>),
      persistidas: true,
    };
  } catch (error) {
    console.error("[guardrails] erro ao ler:", error);
    return { regras: GUARDRAILS_PADRAO, persistidas: false };
  }
}
