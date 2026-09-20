/**
 * Adapter do Resend para envio de e-mails.
 *
 * Implementado a partir da documentação oficial:
 * POST https://api.resend.com/emails
 * Cabeçalhos: Authorization: Bearer re_… + Content-Type: application/json
 * Campos obrigatórios: from, to (máx. 50 por chamada), subject
 * Opcionais usados aqui: html, reply_to, Idempotency-Key
 */

const RESEND_URL = "https://api.resend.com/emails";
/** Limite oficial de destinatários por chamada. */
export const MAX_RECIPIENTS_PER_CALL = 50;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Evita envio duplicado em caso de retry */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      error:
        "Resend não configurado (faltam RESEND_API_KEY e RESEND_FROM_EMAIL).",
    };
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (input.idempotencyKey) {
      headers["Idempotency-Key"] = input.idempotencyKey;
    }

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: json.message ?? `Erro HTTP ${response.status} no Resend`,
      };
    }

    return { ok: true, externalId: json.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Falha ao contactar o Resend: ${error.message}`
          : "Falha desconhecida ao enviar e-mail.",
    };
  }
}

/** Verifica a chave fazendo uma chamada real (sem enviar e-mail a ninguém). */
export async function testResendConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      message: "Faltam RESEND_API_KEY e/ou RESEND_FROM_EMAIL.",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (res.status === 401) {
      return { ok: false, message: "Chave de API inválida." };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `Resposta inesperada (HTTP ${res.status}).`,
      };
    }
    return { ok: true, message: "Ligação ao Resend validada." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Falha ao contactar o Resend.",
    };
  }
}
