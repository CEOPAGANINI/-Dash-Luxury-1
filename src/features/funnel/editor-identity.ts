/** Explicit workspace/account identity; never infer workspace ownership from old local data. */
export function funnelScopeId(userId: string, workspaceId?: string): string {
  return workspaceId
    ? `workspace:${encodeURIComponent(workspaceId)}:user:${encodeURIComponent(userId)}`
    : userId;
}
export function funnelIdentityHeaders(scopeId: string): Record<string, string> {
  const match = /^workspace:([^:]+):user:([^:]+)$/.exec(scopeId);
  return match
    ? {
        "x-editor-user": decodeURIComponent(match[2]),
        "x-editor-workspace": decodeURIComponent(match[1]),
      }
    : { "x-editor-user": scopeId };
}
