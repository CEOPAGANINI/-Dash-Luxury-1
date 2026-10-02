import {
  AgentError,
  redactSecrets,
  type AgentMessage,
  type AgentSettings,
} from "./model";

export function providerRequest(
  settings: AgentSettings,
  apiKey: string,
  system: string,
  messages: AgentMessage[],
): { url: string; headers: Record<string, string>; body: unknown } {
  if (settings.provider === "anthropic")
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: settings.model,
        max_tokens: settings.maxTokens,
        system,
        messages,
      },
    };
  return {
    url:
      settings.provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: settings.model,
      messages: [{ role: "system", content: system }, ...messages],
      max_completion_tokens: settings.maxTokens,
    },
  };
}
export async function callAgentProvider(
  settings: AgentSettings,
  apiKey: string,
  system: string,
  messages: AgentMessage[],
  fetcher: typeof fetch = fetch,
) {
  const spec = providerRequest(settings, apiKey, system, messages);
  let response: Response;
  try {
    response = await fetcher(spec.url, {
      method: "POST",
      headers: spec.headers,
      body: JSON.stringify(spec.body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new AgentError(
      "O provedor não respondeu a tempo. Tente novamente.",
      503,
    );
  }
  if (!response.ok)
    throw new AgentError(
      `O provedor recusou a consulta (HTTP ${response.status}). Confira chave, modelo, saldo e limites.`,
      502,
    );
  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    content?: { type: string; text?: string }[];
    usage?: {
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    };
  } | null;
  const answer =
    settings.provider === "anthropic"
      ? data?.content
          ?.filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("\n")
      : data?.choices?.[0]?.message?.content;
  if (!answer?.trim())
    throw new AgentError(
      "O provedor retornou uma resposta vazia ou incompatível.",
      502,
    );
  const tokens =
    data?.usage?.total_tokens ??
    (settings.provider === "anthropic"
      ? Number(data?.usage?.input_tokens ?? 0) +
        Number(data?.usage?.output_tokens ?? 0)
      : null);
  return {
    answer: redactSecrets(answer.slice(0, 24000))
      .split(apiKey)
      .join("[chave removida]"),
    totalTokens:
      typeof tokens === "number" && Number.isFinite(tokens) ? tokens : null,
  };
}
