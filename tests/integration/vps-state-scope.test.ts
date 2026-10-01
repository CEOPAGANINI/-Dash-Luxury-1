// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));

import { vpsJobs, vpsServers, vpsSites } from "@/database/schema";
import { montarEstado } from "@/features/vps/queries";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

let banco: BancoDeTeste;
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});

describe("polling VPS de detalhe", () => {
  it("consulta e expira só tarefas do servidor autorizado e não cruza workspaces", async () => {
    const own = await criarWorkspaceDeTeste(banco.db);
    const foreign = await criarWorkspaceDeTeste(banco.db);
    const createServer = async (workspaceId: string, name: string) => {
      const [server] = await banco.db
        .insert(vpsServers)
        .values({ workspaceId, name, createdBy: "fixture" })
        .returning({ id: vpsServers.id });
      const [job] = await banco.db
        .insert(vpsJobs)
        .values({
          workspaceId,
          serverId: server.id,
          seq: 1,
          type: "servidor.coletar",
          params: "{}",
          signature: "fixture",
          expiresAt: new Date(Date.now() - 60_000),
          createdBy: "fixture",
        })
        .returning({ id: vpsJobs.id });
      await banco.db.insert(vpsSites).values({
        workspaceId,
        serverId: server.id,
        name,
        slug: name.toLowerCase(),
        checkoutOrigin: "https://app.test",
        createdBy: "fixture",
      });
      return { ...server, job: job.id };
    };
    const selected = await createServer(own.workspaceId, "Escolhido");
    const other = await createServer(own.workspaceId, "Outro");
    const forbidden = await createServer(foreign.workspaceId, "Terceiro");
    const result = await montarEstado(banco.db, own.workspaceId, {
      servidorId: selected.id,
    });
    expect(result.servidores.map((s) => s.nome)).toEqual(["Escolhido"]);
    expect(result.sites.map((s) => s.nome)).toEqual(["Escolhido"]);
    const status = async (id: string) =>
      (
        await banco.db
          .select({ status: vpsJobs.status })
          .from(vpsJobs)
          .where(eq(vpsJobs.id, id))
      )[0].status;
    expect(await status(selected.job)).toBe("expirada");
    expect(await status(other.job)).toBe("pendente");
    expect(await status(forbidden.job)).toBe("pendente");
    const denied = await montarEstado(banco.db, own.workspaceId, {
      servidorId: forbidden.id,
    });
    expect(denied.servidor).toBeNull();
    expect(denied.sites).toEqual([]);
    expect(await status(forbidden.job)).toBe("pendente");
  });
});
