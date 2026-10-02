import { WorkspaceAccessError } from "@/lib/workspace";
import { AgentError } from "./model";
export function agentJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function agentApiError(error: unknown) {
  const known =
    error instanceof AgentError || error instanceof WorkspaceAccessError;
  return agentJson(
    {
      error: known
        ? error.message
        : "Não foi possível acessar o agente. Confira o banco e a configuração de criptografia.",
    },
    known ? error.status : 503,
  );
}
export async function agentRequestBody(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new AgentError("Origem da solicitação inválida.", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AgentError("Envie JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AgentError("Corpo ausente.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64000) {
        await reader.cancel();
        throw new AgentError("Solicitação muito grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AgentError("JSON inválido.");
  }
}
