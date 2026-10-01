import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, isDatabaseConfigured } from "@/database/client";
import { checkouts, payments } from "@/database/schema";
import { getPublicWorkspaceId } from "@/lib/workspace";

const query = z.object({
  attemptId: z.uuid(),
  checkoutId: z.uuid().optional(),
});

/** Random attempt capability exposes status only, never customer/address/payment credentials. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = query.safeParse(params);
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (!isDatabaseConfigured())
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  try {
    const db = getDb();
    const [checkout] = parsed.data.checkoutId
      ? await db
          .select({ workspaceId: checkouts.workspaceId })
          .from(checkouts)
          .where(eq(checkouts.id, parsed.data.checkoutId))
          .limit(1)
      : [];
    if (parsed.data.checkoutId && !checkout)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const workspaceId = checkout?.workspaceId ?? (await getPublicWorkspaceId());
    const [payment] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(
        and(
          eq(payments.workspaceId, workspaceId),
          eq(
            payments.idempotencyKey,
            `checkout:${workspaceId}:${parsed.data.attemptId}`,
          ),
        ),
      )
      .limit(1);
    if (!payment)
      return NextResponse.json(
        { status: "not_started" },
        { headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json(payment, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
