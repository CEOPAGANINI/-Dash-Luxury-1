"use server";

import { revalidatePath } from "next/cache";

import { isDatabaseConfigured } from "@/database/client";
import {
  identifierFrom,
  maskFrom,
  splitSecrets,
  validateFields,
} from "./connection-fields";
import { isConnectionId } from "./connection-meta";
import {
  deleteConnection,
  listConnections,
  upsertConnection,
} from "./connections-store";

export interface ResultadoConexao {
  ok: boolean;
  mensagem: string;
  /** Erros por campo, quando a validação do servidor reprova algo. */
  erros?: Record<string, string>;
}

const SEM_BANCO: ResultadoConexao = {
  ok: false,
  mensagem:
    "Sem banco de dados, a conexão não fica salva. Configure o Supabase na Vercel e tente de novo.",
};

/** As páginas que mostram o estado das conexões. */
function revalidar() {
  revalidatePath("/integracoes");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

/**
 * Salva uma conexão digitada. O segredo entra aqui uma vez, vai
 * criptografado para o banco e não volta — a tela só vê a máscara.
 */
export async function saveConnectionAction(
  _anterior: ResultadoConexao | null,
  formData: FormData,
): Promise<ResultadoConexao> {
  const id = formData.get("id");
  if (!isConnectionId(id) || id === "youtube") {
    return { ok: false, mensagem: "Fonte desconhecida." };
  }
  if (!isDatabaseConfigured()) return SEM_BANCO;

  const values: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (chave !== "id" && typeof valor === "string") values[chave] = valor;
  }

  const erros = validateFields(id, values);
  if (Object.keys(erros).length > 0) {
    return { ok: false, mensagem: "Confira os campos marcados.", erros };
  }

  try {
    const { secrets, publicValues } = splitSecrets(id, values);
    await upsertConnection({
      id,
      identifier: identifierFrom(id, values),
      tokenMask: maskFrom(id, values),
      via: "form",
      secrets,
      publicConfig: publicValues,
    });
  } catch (error) {
    console.error("[connections] erro ao salvar:", error);
    const semChave =
      error instanceof Error && error.message.includes("ENCRYPTION_KEY");
    return {
      ok: false,
      mensagem: semChave
        ? "Falta a variável ENCRYPTION_KEY na Vercel — sem ela o segredo não pode ser guardado com segurança."
        : "Não foi possível salvar. Tente de novo.",
    };
  }

  revalidar();
  return {
    ok: true,
    mensagem:
      "Conectada. O segredo foi criptografado e guardado; a tela mostra só a máscara.",
  };
}

/** Desconecta uma fonte (e o YouTube junto, quando é o Google). */
export async function removeConnectionAction(
  formData: FormData,
): Promise<void> {
  const id = formData.get("id");
  if (!isConnectionId(id) || !isDatabaseConfigured()) return;

  try {
    await deleteConnection(id);
  } catch (error) {
    console.error("[connections] erro ao remover:", error);
    return;
  }
  revalidar();
}

/**
 * YouTube não tem credencial própria: as campanhas de vídeo moram na mesma
 * conta do Google Ads. Conectar é declarar que aquela conta também alimenta
 * os painéis de vídeo.
 */
export async function useGoogleForYoutubeAction(): Promise<ResultadoConexao> {
  if (!isDatabaseConfigured()) return SEM_BANCO;

  const conexoes = await listConnections();
  const google = conexoes.google;
  if (!google) {
    return {
      ok: false,
      mensagem: "Conecte o Google Ads primeiro — o YouTube usa a mesma conta.",
    };
  }

  try {
    await upsertConnection({
      id: "youtube",
      identifier: google.identifier,
      tokenMask: "via Google Ads",
      via: google.via,
      secrets: {},
    });
  } catch (error) {
    console.error("[connections] erro ao ligar o YouTube:", error);
    return { ok: false, mensagem: "Não foi possível salvar. Tente de novo." };
  }

  revalidar();
  return { ok: true, mensagem: "YouTube Ads ligado à conta do Google Ads." };
}
