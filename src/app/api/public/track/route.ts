import { NextResponse } from "next/server";

import {
  InvalidTrackTarget,
  recordTrackEvent,
} from "@/features/analytics/track";
import {
  allowTrackRequest,
  readTrackBody,
  TrackBodyTooLarge,
  trackRequestSchema,
} from "@/features/analytics/track-request";
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
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return NextResponse.json({ ok: false }, { status: 415, headers: cors });
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    if (!(await allowTrackRequest(ip))) {
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { ...cors, "Retry-After": "60" } },
      );
    }
    const parsed = trackRequestSchema.safeParse(await readTrackBody(request));
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400, headers: cors });
    }
    const body = parsed.data;

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
        event: body.event,
        page,
        referrer: body.referrer?.slice(0, 512),
        utm: body.utm,
        productSlug: body.productSlug?.slice(0, 128),
        checkoutId: body.checkoutId,
        valueCents: body.valueCents,
        currency: body.currency?.slice(0, 8),
      },
      {
        userAgent: h.get("user-agent"),
        ip,
        country: h.get("x-vercel-ip-country")?.slice(0, 2) ?? null,
        city: decodeCity(h.get("x-vercel-ip-city")),
        siteOrigin: paginaDaVps,
      },
    );

    return NextResponse.json({ ok: true }, { headers: cors });
  } catch (error) {
    // Não registrar o erro bruto: drivers podem incluir dados da conexão.
    return NextResponse.json(
      { ok: false },
      {
        status:
          error instanceof TrackBodyTooLarge
            ? 413
            : error instanceof InvalidTrackTarget
              ? 400
              : 503,
        headers: cors,
      },
    );
  }
}

function decodeCity(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 128);
  } catch {
    return null;
  }
}
