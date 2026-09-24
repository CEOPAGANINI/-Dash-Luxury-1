// @vitest-environment node
import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

/*
  As rotas do agente chamadas FORA de um pedido do Next, como o adaptador
  HTTP do teste com o agente Python real faz (tests/integration/
  vps-agente-real). Ali `after()` lança "called outside a request scope";
  a rota não pode transformar isso em 500 depois de já ter consumido o
  código de instalação. Aqui next/server NÃO é trocado.
*/

const estado = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({
  getDb: () => estado.db,
  isDatabaseConfigured: () => true,
}));

import { POST as registrarPOST } from "@/app/api/agente/v1/registrar/route";
import { auditLogs, vpsServers } from "@/database/schema";
import { sha256hex } from "@/features/vps/chaves";
import { criarServidor } from "@/features/vps/servico";

import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

let db: BancoDeTeste["db"];
let workspaceId: string;

beforeAll(async () => {
  const banco = await criarBancoDeTeste();
  db = banco.db;
  estado.db = db;
  ({ workspaceId } = await criarWorkspaceDeTeste(db));
}, 60_000);

describe("rotas do agente fora do Next", () => {
  it("registrar responde 200 e a auditoria roda mesmo sem after()", async () => {
    vi.stubEnv("VPS_CHAVE_MESTRA", "z".repeat(48));
    const { servidorId, codigo } = await criarServidor(db, {
      workspaceId,
      nome: "fora do next",
      por: "semear",
      painel: "http://127.0.0.1:3100",
    });
    const token = randomBytes(32).toString("base64url");
    const resposta = await registrarPOST(
      new NextRequest("http://127.0.0.1:3100/api/agente/v1/registrar", {
        method: "POST",
        body: JSON.stringify({
          codigo,
          tokenHash: sha256hex(token),
          agente: { versao: "1.0.0", hostname: "e2e", so: "Ubuntu 24.04" },
        }),
      }),
    );
    expect(resposta.status).toBe(200);
    expect((await resposta.json()).servidorId).toBe(servidorId);
    await vi.waitFor(async () => {
      const linhas = await db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, servidorId));
      expect(linhas).toEqual([{ action: "vps.servidor.registrado" }]);
    });
    const [srv] = await db
      .select({ status: vpsServers.status })
      .from(vpsServers)
      .where(eq(vpsServers.id, servidorId));
    expect(srv.status).toBe("aguardando_confirmacao");
    vi.unstubAllEnvs();
  });
});
