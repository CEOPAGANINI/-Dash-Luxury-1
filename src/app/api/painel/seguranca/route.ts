import { protectPrivateResponse } from "@/lib/auth/deployment-security";
import { auditedSecurityChecks } from "@/features/security-center/audit";
import {
  getLiveSecuritySnapshot,
  SecurityAccessError,
} from "@/features/security-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const headers = new Headers();
  protectPrivateResponse(headers);
  try {
    const snapshot = await getLiveSecuritySnapshot();
    return Response.json(
      { ...snapshot, checks: [...snapshot.checks, ...auditedSecurityChecks] },
      { headers },
    );
  } catch (error) {
    const status = error instanceof SecurityAccessError ? error.status : 503;
    const message =
      error instanceof SecurityAccessError
        ? error.message
        : "Não foi possível carregar as verificações. Tente novamente.";
    return Response.json({ message }, { status, headers });
  }
}
