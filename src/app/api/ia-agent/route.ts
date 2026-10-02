import { exigirWorkspaceRole } from "@/lib/workspace";
import {
  AgentError,
  AGENT_SYSTEM,
  parseAgentRequest,
  type AgentRun,
} from "@/features/ai-agent/model";
import {
  agentApiError,
  agentJson,
  agentRequestBody,
} from "@/features/ai-agent/api";
import { callAgentProvider } from "@/features/ai-agent/provider";
import {
  agentContext,
  agentHistory,
  failAgentRun,
  finishAgentRun,
  readAgentConnection,
  reserveAgentRun,
} from "@/features/ai-agent/store";
export const runtime = "nodejs";
export const maxDuration = 60;
const roles = ["owner", "admin", "marketing", "analyst"] as const;
export async function GET() {
  try {
    const access = await exigirWorkspaceRole([...roles]);
    return agentJson({
      runs: await agentHistory(access.workspaceId, access.user.id),
    });
  } catch (error) {
    return agentApiError(error);
  }
}
export async function POST(request: Request) {
  let reservation: { workspaceId: string; id: string } | undefined;
  try {
    const access = await exigirWorkspaceRole([...roles]);
    const input = parseAgentRequest(await agentRequestBody(request));
    const connection = await readAgentConnection(access.workspaceId);
    if (!connection)
      throw new AgentError(
        "Configure um provedor e um modelo em Configurações do agente. Nenhum dado de demonstração será usado nesta consulta.",
        409,
      );
    const context = await agentContext(access.workspaceId, connection.settings);
    const id = await reserveAgentRun(
      access.workspaceId,
      access.user.id,
      connection.settings,
    );
    reservation = { workspaceId: access.workspaceId, id };
    const result = await callAgentProvider(
      connection.settings,
      connection.apiKey,
      AGENT_SYSTEM +
        "\nTarefa: " +
        input.task +
        "\nContexto de leitura:\n" +
        context,
      [...input.history, { role: "user", content: input.prompt }],
    );
    const run: AgentRun = {
      id,
      createdAt: new Date().toISOString(),
      task: input.task,
      prompt: input.prompt,
      answer: result.answer,
      mode: "real",
      provider: connection.settings.provider,
      model: connection.settings.model,
      totalTokens: result.totalTokens,
    };
    await finishAgentRun(access.workspaceId, access.user.id, run);
    return agentJson({ run });
  } catch (error) {
    if (reservation)
      await failAgentRun(reservation.workspaceId, reservation.id).catch(
        () => undefined,
      );
    return agentApiError(error);
  }
}
