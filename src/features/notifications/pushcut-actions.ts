"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isDatabaseConfigured } from "@/database/client";
import {
  savePushcutCredentials,
  sendPushcutNotification,
  setPushcutActive,
} from "@/features/notifications/pushcut";

const pushcutSchema = z.object({
  apiKey: z.string().trim().min(10, "Cole a chave de API do Pushcut"),
  notificationName: z
    .string()
    .trim()
    .min(1, "Informe o nome da notificação criada na app"),
  events: z.array(z.string()).min(1, "Escolha pelo menos um evento"),
});

export interface PushcutActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function savePushcutAction(
  _prev: PushcutActionResult | null,
  formData: FormData,
): Promise<PushcutActionResult> {
  const parsed = pushcutSchema.safeParse({
    apiKey: formData.get("apiKey"),
    notificationName: formData.get("notificationName"),
    events: formData.getAll("events"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const d = parsed.data;
    await savePushcutCredentials(d.apiKey, d.notificationName, d.events);

    // Validação real: envia um push de confirmação. Se a chave ou o nome
    // estiverem errados, o utilizador descobre agora e não numa venda.
    const test = await sendPushcutNotification(
      "Infinity ligado ✅",
      "Se recebeu este alerta, as notificações de venda estão a funcionar.",
      { force: true },
    );

    if (!test.ok) {
      return {
        ok: false,
        error: `Credenciais guardadas, mas o envio de teste falhou: ${test.error}`,
      };
    }

    revalidatePath("/notificacoes");
    return {
      ok: true,
      message: "Ligado! Verifique o push que acabou de receber no telemóvel.",
    };
  } catch (error) {
    console.error("[pushcut] erro ao guardar:", error);
    return { ok: false, error: "Não foi possível guardar a integração." };
  }
}

export async function togglePushcutAction(formData: FormData): Promise<void> {
  const active = formData.get("active") === "true";
  if (!isDatabaseConfigured()) return;

  await setPushcutActive(active);
  revalidatePath("/notificacoes");
}

export async function testPushcutAction(): Promise<void> {
  await sendPushcutNotification(
    "Teste do Infinity 🔔",
    "Notificação de teste enviada a partir do painel.",
    { force: true },
  );
  revalidatePath("/notificacoes");
}
