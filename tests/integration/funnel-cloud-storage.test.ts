// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({ getDb: () => state.db }));
import {
  readCloudVault,
  writeCloudVault,
  listCloudHistory,
  readCloudHistory,
  FunnelCloudConflict,
} from "@/features/funnel/cloud-server";
import {
  funnelPackages,
  funnelVaultHistory,
} from "@/database/schema/funnel-storage";
import type { FunnelEnvelope } from "@/features/funnel/funil-store";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  lerMigracao,
  type BancoDeTeste,
} from "../helpers/pglite";
let banco: BancoDeTeste;
let workspaceId: string;
const envelope = (name: string): FunnelEnvelope => ({
  versao: 1,
  revisao: crypto.randomUUID(),
  rascunho: { id: "f", nome: name, projeto: "Loja", nodes: [], edges: [] },
  funis: [],
  redirecionadores: [],
});
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
  await banco.pg.exec(lerMigracao("0007_funnel_storage.sql"));
  await banco.pg.exec(lerMigracao("0007_funnel_storage.sql"));
  workspaceId = (await criarWorkspaceDeTeste(banco.db)).workspaceId;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});
describe("authenticated funnel vault database", () => {
  it("round trips data and does not leak to another account or workspace", async () => {
    const saved = await writeCloudVault(
      workspaceId,
      "user",
      null,
      envelope("First"),
    );
    expect((await readCloudVault(workspaceId, "user")).revision).toBe(
      saved.revision,
    );
    expect((await readCloudVault(workspaceId, "other")).envelope).toBeNull();
    expect(
      (await readCloudVault(crypto.randomUUID(), "user")).envelope,
    ).toBeNull();
  });
  it("rejects stale saves, commits history and permits exactly one competing revision", async () => {
    const current = await readCloudVault(workspaceId, "user");
    const outcomes = await Promise.allSettled([
      writeCloudVault(workspaceId, "user", current.revision, envelope("A")),
      writeCloudVault(workspaceId, "user", current.revision, envelope("B")),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome) => outcome.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(FunnelCloudConflict);
    const history = await banco.db
      .select()
      .from(funnelVaultHistory)
      .where(eq(funnelVaultHistory.workspaceId, workspaceId));
    expect(history[0].envelope.rascunho?.nome).toBe("First");
    expect((await listCloudHistory(workspaceId, "user"))[0].revision).toBe(
      history[0].revision,
    );
    expect(
      (await readCloudHistory(workspaceId, "user", history[0].revision))
        ?.rascunho?.nome,
    ).toBe("First");
    expect(
      await readCloudHistory(workspaceId, "other", history[0].revision),
    ).toBeNull();
  });
  it("stores real binary bytes and the database rejects wrong lengths and oversized packages", async () => {
    const value = {
      workspaceId,
      userId: "user",
      funnelId: "f",
      nodeId: "n",
      productId: "",
      filename: "site.zip",
      sha256: "known",
      sizeBytes: 4,
      content: Buffer.from([0, 1, 2, 3]),
    };
    await banco.db.insert(funnelPackages).values(value);
    const [read] = await banco.db
      .select()
      .from(funnelPackages)
      .where(eq(funnelPackages.workspaceId, workspaceId));
    expect([...read.content]).toEqual([0, 1, 2, 3]);
    await expect(
      banco.db
        .insert(funnelPackages)
        .values({ ...value, nodeId: "bad", sizeBytes: 3 }),
    ).rejects.toThrow();
    await expect(
      banco.db
        .insert(funnelPackages)
        .values({ ...value, nodeId: "huge", sizeBytes: 3_000_001 }),
    ).rejects.toThrow();
    const security = await banco.pg.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('funnel_vaults','funnel_vault_history','funnel_packages')",
    );
    expect(security.rows).toHaveLength(3);
    expect(security.rows.every((row) => row.relrowsecurity)).toBe(true);
  });
});
