// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  userId: "user",
  workspaceId: "workspace",
  denial: 0,
}));
vi.mock("@/lib/workspace", () => {
  class WorkspaceAccessError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    WorkspaceAccessError,
    exigirWorkspaceRole: vi.fn(async () => {
      if (state.denial)
        throw new WorkspaceAccessError(state.denial, "Acesso negado.");
      return {
        user: { id: state.userId },
        workspaceId: state.workspaceId,
        role: "owner",
      };
    }),
  };
});
vi.mock("@/features/funnel/cloud-server", () => ({
  readCloudVault: vi.fn(async () => ({ revision: null, envelope: null })),
  writeCloudVault: vi.fn(async () => ({ revision: crypto.randomUUID() })),
  listCloudHistory: vi.fn(async () => []),
  readCloudHistory: vi.fn(async () => null),
  FunnelCloudConflict: class extends Error {},
}));
import { GET, PUT } from "@/app/api/editor/funil/route";
import {
  readCloudVault,
  writeCloudVault,
} from "@/features/funnel/cloud-server";
import { readLimitedBody } from "@/features/funnel/request-body";
const headers = {
  origin: "https://app.test",
  "x-editor-user": "user",
  "x-editor-workspace": "workspace",
};
beforeEach(() => {
  state.denial = 0;
  vi.clearAllMocks();
});
describe("funnel API data boundary", () => {
  it.each([401, 403])(
    "retains authentication denial status %s without any database read",
    async (denial) => {
      state.denial = denial;
      expect(
        (
          await GET(
            new Request("https://app.test/api/editor/funil", { headers }),
          )
        ).status,
      ).toBe(denial);
      expect(readCloudVault).not.toHaveBeenCalled();
    },
  );
  it("rejects stale workspace/account sessions before accessing any stored data", async () => {
    const response = await GET(
      new Request("https://app.test/api/editor/funil", {
        headers: { ...headers, "x-editor-workspace": "other" },
      }),
    );
    expect(response.status).toBe(409);
    expect(readCloudVault).not.toHaveBeenCalled();
    const put = await PUT(
      new Request("https://app.test/api/editor/funil", {
        method: "PUT",
        headers: { ...headers, "x-editor-user": "other" },
        body: "{}",
      }),
    );
    expect(put.status).toBe(409);
    expect(writeCloudVault).not.toHaveBeenCalled();
  });
  it("rejects foreign origin, malformed JSON, invalid history IDs and oversized streams", async () => {
    expect(
      (
        await PUT(
          new Request("https://app.test/api/editor/funil", {
            method: "PUT",
            headers: { ...headers, origin: "https://evil.test" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await PUT(
          new Request("https://app.test/api/editor/funil", {
            method: "PUT",
            headers,
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request("https://app.test/api/editor/funil?revision=not-a-uuid", {
            headers,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          new Request("https://app.test/api/editor/funil", {
            method: "PUT",
            headers,
            body: "x".repeat(3_000_001),
          }),
        )
      ).status,
    ).toBe(413);
    await expect(
      readLimitedBody(
        new Request("https://app.test", {
          method: "POST",
          body: "a".repeat(101),
        }),
        100,
      ),
    ).rejects.toBeInstanceOf(RangeError);
    expect(writeCloudVault).not.toHaveBeenCalled();
  });
  it("never fetches a historical version from another identity", async () => {
    const response = await GET(
      new Request(
        `https://app.test/api/editor/funil?revision=${crypto.randomUUID()}`,
        { headers: { ...headers, "x-editor-workspace": "other" } },
      ),
    );
    expect(response.status).toBe(409);
  });
});
