"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { workspaces } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { GUARDRAILS_SETTINGS_KEY } from "./queries";
import { normalizarGuardrails } from "./rules";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

/**
 * Salva as regras do freio de mão no workspace.
 *
 * O formulário chega como texto; `normalizarGuardrails` põe cada valor no
 * piso e no teto antes de gravar, então uma vírgula no lugar do ponto ou um
 * zero a mais não viram regra.
 */
export async function saveGuardrailsAction(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      mensagem:
        "Sem banco de dados configurado, as regras não ficam salvas. Configure o Supabase para guardá-las.",
    };
  }

  const regras = normalizarGuardrails({
    margemMinima: Number(formData.get("margemMinima")) / 100,
    roasMinimo: formData.get("roasMinimo"),
    roasPausa: formData.get("roasPausa"),
    gastoMaximoDia: formData.get("gastoMaximoDia"),
    escalaMaxima: Number(formData.get("escalaMaxima")) / 100,
    pausarDiaNegativo: formData.get("pausarDiaNegativo"),
    diasToleranciaNegativo: formData.get("diasToleranciaNegativo"),
    aprovacaoAcimaDe: formData.get("aprovacaoAcimaDe"),
  });

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const [row] = await db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const settings = (row?.settings ?? {}) as Record<string, unknown>;
    await db
      .update(workspaces)
      .set({
        settings: { ...settings, [GUARDRAILS_SETTINGS_KEY]: regras },
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  } catch (error) {
    console.error("[guardrails] erro ao salvar:", error);
    return { ok: false, mensagem: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath("/seguranca");
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Regras salvas. Valem a partir de agora." };
}
