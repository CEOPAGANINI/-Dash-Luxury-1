"use server";

import { z } from "zod";

import { getSegmentRecipients } from "@/features/emails/segments";
import type { SegmentKey } from "@/features/emails/types";
import {
  isResendConfigured,
  sendEmail,
  testResendConnection,
} from "@/features/emails/resend-provider";
import { company } from "@/lib/company";
import { getAppUrl } from "@/lib/app-url";

const campaignSchema = z.object({
  segment: z.enum(["paid", "pending", "refused", "no_orders", "all"]),
  subject: z.string().trim().min(3, "Escreva um assunto"),
  body: z.string().trim().min(10, "Escreva a mensagem"),
  testEmail: z
    .string()
    .trim()
    .email("E-mail de teste inválido")
    .optional()
    .or(z.literal("")),
  mode: z.enum(["test", "send"]),
});

export interface EmailActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  sent?: number;
  failed?: number;
}

/** Substitui as variáveis disponíveis no corpo da mensagem. */
function renderTemplate(
  template: string,
  vars: { nome: string; primeiroNome: string; email: string },
): string {
  return template
    .replaceAll("{{NOME}}", vars.nome)
    .replaceAll("{{PRIMEIRO_NOME}}", vars.primeiroNome)
    .replaceAll("{{EMAIL}}", vars.email);
}

/** Envolve o texto num HTML simples e legível, com rodapé de descadastro. */
function wrapHtml(bodyText: string): string {
  const paragraphs = bodyText
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `<p style="margin:0 0 14px;line-height:1.6">${l}</p>`)
    .join("");

  return `<!doctype html><html lang="pt"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-size:20px;font-weight:800">${company.tradeName}</p>
${paragraphs}
<hr style="margin:24px 0;border:none;border-top:1px solid #e4e4e7">
<p style="margin:0;font-size:12px;color:#71717a">
Recebeu este e-mail porque comprou ou iniciou uma compra em ${company.tradeName}.<br>
Para deixar de receber, responda a este e-mail com "REMOVER".
</p>
</div></body></html>`;
}

export async function sendCampaignAction(
  _prev: EmailActionResult | null,
  formData: FormData,
): Promise<EmailActionResult> {
  const parsed = campaignSchema.safeParse({
    segment: formData.get("segment"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    testEmail: formData.get("testEmail") ?? "",
    mode: formData.get("mode"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { segment, subject, body, testEmail, mode } = parsed.data;

  if (!isResendConfigured()) {
    return {
      ok: false,
      error:
        "O envio de e-mails ainda não está ativo: configure RESEND_API_KEY e RESEND_FROM_EMAIL. Nenhum e-mail foi enviado.",
    };
  }

  // Envio de teste: um único destinatário, sem tocar na base de clientes.
  if (mode === "test") {
    if (!testEmail) {
      return { ok: false, error: "Informe o e-mail para receber o teste." };
    }
    const html = wrapHtml(
      renderTemplate(body, {
        nome: "Cliente Exemplo",
        primeiroNome: "Cliente",
        email: testEmail,
      }),
    );
    const result = await sendEmail({
      to: testEmail,
      subject: `[TESTE] ${subject}`,
      html,
      replyTo: company.email,
    });
    return result.ok
      ? { ok: true, message: `E-mail de teste enviado para ${testEmail}.` }
      : { ok: false, error: result.error };
  }

  const recipients = await getSegmentRecipients(segment as SegmentKey);
  if (recipients.length === 0) {
    return { ok: false, error: "Este segmento não tem destinatários." };
  }

  let sent = 0;
  let failed = 0;
  const appUrl = getAppUrl();

  for (const r of recipients) {
    const html = wrapHtml(
      renderTemplate(body, {
        nome: r.name,
        primeiroNome: r.name.split(" ")[0],
        email: r.email,
      }).replaceAll("{{LOJA_URL}}", appUrl),
    );

    const result = await sendEmail({
      to: r.email,
      subject,
      html,
      replyTo: company.email,
      // Evita duplicar se a ação for reenviada por engano no mesmo minuto.
      idempotencyKey: `campanha_${segment}_${r.id}_${new Date().toISOString().slice(0, 16)}`,
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return {
    ok: failed === 0,
    sent,
    failed,
    message:
      failed === 0
        ? `Campanha enviada para ${sent} ${sent === 1 ? "cliente" : "clientes"}.`
        : undefined,
    error:
      failed > 0
        ? `Enviados ${sent}, falharam ${failed}. Verifique os endereços e o domínio verificado no Resend.`
        : undefined,
  };
}

export async function testResendAction(): Promise<void> {
  await testResendConnection();
}
