import { NextResponse } from "next/server";

import {
  recordTrackEvent,
  TRACK_EVENTS,
  type TrackEvent,
} from "@/features/analytics/track";
import { origemPermitidaNoRastreio } from "@/features/vps/cors-rastreio";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * Endpoint público de rastreamento (chamado pelo navegador nas páginas da
 * loja). Pública por necessidade: quem chama é o visitante, não o painel.
 *
 * Protegido por: lista fechada de eventos, limites de tamanho, e nenhum dado
 * sensível gravado (IP mascarado, sessão anônima).
 *
 * Páginas do funil hospedadas na VPS (outro domínio) também mandam eventos
 * para cá, pelo /agente/v1/rastreio.js. Para elas vale CORS, só para os
 * domínios de site com DNS conferido (src/features/vps/cors-rastreio.ts):
 * - OPTIONS responde a pré-verificação;
 * - POST dessas origens grava a página como https://<domínio><caminho>
 *   (para não se misturar com as páginas do próprio app) e responde com
 *   Access-Control-Allow-Origin, senão o console do visitante acumula erro;
 * - POST de qualquer outra origem de fora: 403, sem gravar nada;
 * - POST sem Origin, ou da origem do próprio app: como sempre foi.
 */

/** A origem do próprio app (o endereço deste pedido ou o de getAppUrl()). */
function ehDoApp(origem: string, request: Request): boolean {
  try {
    if (origem === new URL(request.url).origin) return true;
  } catch {
    // URL do pedido sem origem: segue para getAppUrl()
  }
  try {
    return origem === new URL(getAppUrl()).origin;
  } catch {
    return false;
  }
}

function cabecalhosCors(origem: string): Record<string, string> {
  return { "Access-Control-Allow-Origin": origem, Vary: "Origin" };
}

export async function OPTIONS(request: Request) {
  const origem = request.headers.get("origin");
  const permitida = await origemPermitidaNoRastreio(origem);
  if (!permitida) {
    const deFora = Boolean(origem) && !ehDoApp(origem!, request);
    return new Response(null, {
      status: deFora ? 403 : 204,
      headers: { Vary: "Origin", Allow: "POST, OPTIONS" },
    });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...cabecalhosCors(permitida),
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "600",
    },
  });
}

export async function POST(request: Request) {
  const origem = request.headers.get("origin");
  let cors: Record<string, string> = {};
  let paginaDaVps: string | null = null;
  if (origem && !ehDoApp(origem, request)) {
    const permitida = await origemPermitidaNoRastreio(origem);
    if (!permitida)
      return NextResponse.json(
        { ok: false },
        { status: 403, headers: { Vary: "Origin" } },
      );
    cors = cabecalhosCors(permitida);
    paginaDaVps = permitida;
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      anonymousId?: string;
      event?: string;
      page?: string;
      referrer?: string;
      utm?: Record<string, string>;
      productSlug?: string;
      valueCents?: number;
      currency?: string;
    } | null;

    if (!body?.anonymousId || !body?.event) {
      return NextResponse.json({ ok: false }, { status: 400, headers: cors });
    }
    if (!TRACK_EVENTS.includes(body.event as TrackEvent)) {
      return NextResponse.json({ ok: false }, { status: 400, headers: cors });
    }
    if (body.anonymousId.length > 64) {
      return NextResponse.json({ ok: false }, { status: 400, headers: cors });
    }

    const caminho =
      typeof body.page === "string" && body.page.startsWith("/")
        ? body.page
        : "/";
    const page = paginaDaVps
      ? `${paginaDaVps}${caminho}`.slice(0, 512)
      : body.page?.slice(0, 512);

    const h = request.headers;
    await recordTrackEvent(
      {
        anonymousId: body.anonymousId,
        event: body.event as TrackEvent,
        page,
        referrer: body.referrer?.slice(0, 512),
        utm: body.utm,
        productSlug: body.productSlug?.slice(0, 128),
        valueCents: body.valueCents,
        currency: body.currency?.slice(0, 8),
      },
      {
        userAgent: h.get("user-agent"),
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        country: h.get("x-vercel-ip-country"),
        city: h.get("x-vercel-ip-city")
          ? decodeURIComponent(h.get("x-vercel-ip-city")!)
          : null,
      },
    );

    return NextResponse.json({ ok: true }, { headers: cors });
  } catch (error) {
    // Rastreamento nunca pode quebrar a experiência do visitante.
    console.error("[track] erro:", error);
    return NextResponse.json({ ok: false }, { status: 200, headers: cors });
  }
}
