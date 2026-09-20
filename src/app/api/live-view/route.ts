import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getLiveSnapshot } from "@/features/analytics/live-queries";
import { expireStaleSessions } from "@/features/analytics/track";

export const dynamic = "force-dynamic";

/** Dados do Live View. Rota do painel — exige sessão autenticada. */
export async function GET() {
  const session = await getSession();
  if (!session || session.demoMode) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await expireStaleSessions();
  const snapshot = await getLiveSnapshot();

  if (!snapshot) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  return NextResponse.json(snapshot);
}
