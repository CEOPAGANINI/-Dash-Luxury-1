import type { SessionUser } from "./auth/session";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "finance"
  | "marketing"
  | "support"
  | "analyst"
  | "viewer";
export function principalOperator(
  user: SessionUser,
  env: Record<string, string | undefined>,
): boolean {
  if (!user.emailConfirmado) return false;
  const configured = (env.DASHBOARD_DONOS ?? env.VPS_DONOS ?? "")
    .split(/[,;\n]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return (
    configured.includes(user.id.toLowerCase()) ||
    configured.includes(user.email.trim().toLowerCase())
  );
}
export function roleAllows(
  role: WorkspaceRole,
  accepted: WorkspaceRole | WorkspaceRole[],
): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    (Array.isArray(accepted) ? accepted : [accepted]).includes(role)
  );
}
