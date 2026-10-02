import { exigirWorkspaceRole } from "@/lib/workspace";
import { AgentError, parseAgentSettings } from "@/features/ai-agent/model";
import {
  agentApiError,
  agentJson,
  agentRequestBody,
} from "@/features/ai-agent/api";
import {
  disconnectAgent,
  publicAgentConnection,
  saveAgentConnection,
} from "@/features/ai-agent/store";
export const runtime = "nodejs";
export async function GET() {
  try {
    const access = await exigirWorkspaceRole([
      "owner",
      "admin",
      "marketing",
      "analyst",
    ]);
    return agentJson({
      ...(await publicAgentConnection(access.workspaceId)),
      canConfigure: ["owner", "admin"].includes(access.role),
    });
  } catch (error) {
    return agentApiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const access = await exigirWorkspaceRole();
    const body = (await agentRequestBody(request)) as {
      settings?: unknown;
      apiKey?: unknown;
    };
    if (typeof body.apiKey !== "string")
      throw new AgentError("Chave inválida.");
    await saveAgentConnection(
      access.workspaceId,
      parseAgentSettings(body.settings),
      body.apiKey.trim(),
    );
    return agentJson(await publicAgentConnection(access.workspaceId));
  } catch (error) {
    return agentApiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const access = await exigirWorkspaceRole();
    await agentRequestBody(request);
    await disconnectAgent(access.workspaceId);
    return agentJson({ disconnected: true });
  } catch (error) {
    return agentApiError(error);
  }
}
