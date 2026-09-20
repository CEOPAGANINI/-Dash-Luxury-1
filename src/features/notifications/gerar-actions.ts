"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { notifications } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { avaliarAgora } from "./avaliar-agora";

export interface ResultadoGeracao {
  ok: boolean;
  criadas: number;
  repetidas: number;
  mensagem: string;
}

/** Um aviso com a mesma chave dentro desta janela não é gravado de novo. */
const JANELA_REPETICAO_MS = 24 * 60 * 60 * 1000;

/**
 * Roda as regras e grava os avisos que ainda não existem.
 *
 * A chave de cada aviso vai em `metadata.chave`; se já houver um com a
 * mesma chave nas últimas 24 horas, ele é pulado. Assim o botão pode ser
 * apertado quantas vezes for — e, quando virar tarefa agendada, rodar de
 * hora em hora — sem encher a lista com o mesmo aviso.
 */
export async function gerarAvisosAction(): Promise<ResultadoGeracao> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      criadas: 0,
      repetidas: 0,
      mensagem:
        "Sem banco de dados, os avisos aparecem só na prévia. Configure o Supabase para gravá-los.",
    };
  }

  const { avisos } = await avaliarAgora();
  if (avisos.length === 0) {
    return { ok: true, criadas: 0, repetidas: 0, mensagem: "Nenhuma regra disparou agora." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const recentes = await db
      .select({ metadata: notifications.metadata })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          gt(notifications.createdAt, new Date(Date.now() - JANELA_REPETICAO_MS)),
        ),
      );
    const chavesRecentes = new Set(
      recentes
        .map((r) => (r.metadata as { chave?: unknown } | null)?.chave)
        .filter((c): c is string => typeof c === "string"),
    );

    const novos = avisos.filter((a) => !chavesRecentes.has(a.chave));
    if (novos.length > 0) {
      await db.insert(notifications).values(
        novos.map((a) => ({
          workspaceId,
          eventType: a.eventType,
          title: a.title,
          body: a.body,
          href: a.href,
          valueCents: a.valueCents,
          channel: "in_app" as const,
          metadata: { chave: a.chave, severidade: a.severidade, origem: "regras" },
        })),
      );
    }

    revalidatePath("/notificacoes");
    const repetidas = avisos.length - novos.length;
    return {
      ok: true,
      criadas: novos.length,
      repetidas,
      mensagem:
        novos.length === 0
          ? "Todos os avisos de agora já estavam na lista."
          : `${novos.length} aviso(s) novo(s)${repetidas ? `, ${repetidas} já existia(m)` : ""}.`,
    };
  } catch (error) {
    console.error("[notifications] erro ao gerar avisos:", error);
    return { ok: false, criadas: 0, repetidas: 0, mensagem: "Não foi possível gravar. Tente de novo." };
  }
}
