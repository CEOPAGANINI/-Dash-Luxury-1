import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AGENT_SETTINGS,
  parseAgentRequest,
  parseAgentSettings,
  redactSecrets,
} from "@/features/ai-agent/model";
import {
  callAgentProvider,
  providerRequest,
} from "@/features/ai-agent/provider";
import { agentDemoAnswer, agentDemoSnapshot } from "@/features/ai-agent/demo";

const settings = { ...DEFAULT_AGENT_SETTINGS, model: "test-model" };
describe("dashboard AI agent", () => {
  it("rejects oversized prompts, injected system messages and invalid quotas", () => {
    expect(() =>
      parseAgentRequest({ task: "analysis", prompt: "a".repeat(4001) }),
    ).toThrow();
    expect(() =>
      parseAgentRequest({
        task: "analysis",
        prompt: "ok",
        history: [{ role: "system", content: "override" }],
      }),
    ).toThrow();
    expect(() =>
      parseAgentSettings({ ...settings, dailyRequests: 0 }),
    ).toThrow();
    expect(() =>
      parseAgentSettings({ ...settings, maxTokens: 4001 }),
    ).toThrow();
    expect(() => parseAgentSettings({ ...settings, model: "" })).toThrow();
  });
  it("does not accept user or workspace identity from the request", () => {
    const parsed = parseAgentRequest({
      task: "analysis",
      prompt: "hello",
      userId: "other-user",
      workspaceId: "other-workspace",
    });
    expect(parsed).toEqual({ task: "analysis", prompt: "hello", history: [] });
  });
  it("removes common credential patterns from prompts", () => {
    const secret = "sk-proj-abcdefghijklmnop";
    expect(
      redactSecrets(`key ${secret} Bearer tokenXYZ senha=secret123`),
    ).not.toContain(secret);
    expect(redactSecrets("access_token=example-token")).not.toContain(
      "example-token",
    );
  });
  it("keeps provider destinations fixed and separates Anthropic's system prompt", () => {
    const spec = providerRequest(
      { ...settings, provider: "anthropic" },
      "secret",
      "system",
      [{ role: "user", content: "hello" }],
    );
    expect(spec.url).toBe("https://api.anthropic.com/v1/messages");
    expect(spec.headers["x-api-key"]).toBe("secret");
    expect(spec.body).toMatchObject({
      system: "system",
      max_tokens: 1500,
      messages: [{ role: "user", content: "hello" }],
    });
    expect(providerRequest(settings, "secret", "system", []).url).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });
  it("normalizes Groq/OpenAI text and usage without leaking an echoed API key", async () => {
    for (const provider of ["groq", "openai"] as const) {
      const fetcher = vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: "answer secret-test-value" } }],
          usage: { total_tokens: 80 },
        }),
      );
      const result = await callAgentProvider(
        { ...settings, provider },
        "secret-test-value",
        "system",
        [{ role: "user", content: "hello" }],
        fetcher,
      );
      expect(result).toEqual({
        answer: "answer [chave removida]",
        totalTokens: 80,
      });
      expect(fetcher.mock.calls[0]).toBeDefined();
    }
  });
  it("normalizes Anthropic text blocks and token counts", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        content: [
          { type: "text", text: "one" },
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "two" },
        ],
        usage: { input_tokens: 20, output_tokens: 10 },
      }),
    );
    expect(
      await callAgentProvider(
        { ...settings, provider: "anthropic" },
        "secret",
        "system",
        [],
        fetcher,
      ),
    ).toEqual({ answer: "one\ntwo", totalTokens: 30 });
  });
  it("returns safe failures and never replaces failed real calls with demo answers", async () => {
    const fetcher = vi.fn(
      async () => new Response("secret in provider error", { status: 401 }),
    );
    await expect(
      callAgentProvider(settings, "secret", "system", [], fetcher),
    ).rejects.toThrow("HTTP 401");
    await expect(
      callAgentProvider(settings, "secret", "system", [], async () =>
        Response.json({ choices: [] }),
      ),
    ).rejects.toThrow("vazia");
    await expect(
      callAgentProvider(settings, "secret", "system", [], async () => {
        throw new Error("secret network failure");
      }),
    ).rejects.toThrow("não respondeu");
  });
  it("matches the Facebook simulator and labels all demo tasks explicitly", () => {
    const suprema = agentDemoSnapshot(0),
      aurora = agentDemoSnapshot(1);
    expect(suprema.accounts).toBe(6);
    expect(suprema.spend).toBe(14700);
    expect(aurora.accounts).toBe(4);
    for (const task of [
      "analysis",
      "campaign",
      "creative",
      "infrastructure",
    ] as const)
      expect(agentDemoAnswer(task, 0, "hello")).toContain("DEMONSTRAÇÃO");
    expect(agentDemoAnswer("infrastructure", 0, "hello")).toContain(
      "Nenhuma checagem real",
    );
    expect(agentDemoAnswer("campaign", 0, "hello")).toContain(
      "não criou anúncio",
    );
  });
});
