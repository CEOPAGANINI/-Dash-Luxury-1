import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { criarCofreFunil } from "@/features/funnel/funil-store";
import { mergeFunnelEnvelopes } from "@/features/funnel/cloud-contract";
import { connectFunnelCloud } from "@/features/funnel/cloud-client";
import {
  funnelScopeId,
  funnelIdentityHeaders,
} from "@/features/funnel/editor-identity";
import {
  calcularPrevisao,
  PREVISAO_PADRAO,
} from "@/features/funnel/funnel-forecast";
import { decidirDestino } from "@/features/offer-router/offer-router-model";
import type {
  FunnelData,
  FunnelNode,
  RegraRedir,
} from "@/features/funnel/funnel-model";

const fixture = (name = "Local"): FunnelData => ({
  id: "funnel",
  nome: name,
  projeto: "Loja",
  nodes: [],
  edges: [],
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("cloud, archive and traffic integrity", () => {
  it("isolates the same user in two workspaces and authenticates both headers", () => {
    const a = funnelScopeId("user", "workspace-a"),
      b = funnelScopeId("user", "workspace-b");
    criarCofreFunil(a).salvarRascunho(fixture());
    expect(criarCofreFunil(b).lerRascunho()).toBeNull();
    expect(funnelIdentityHeaders(a)).toEqual({
      "x-editor-user": "user",
      "x-editor-workspace": "workspace-a",
    });
  });
  it("archives current unsaved contents and restores without deleting data", () => {
    const store = criarCofreFunil("user");
    store.salvarFunil(fixture("Antes"));
    store.arquivarFunil(fixture("Editado"));
    expect(store.lerRascunho()).toBeNull();
    expect(store.listarFunis()[0]).toMatchObject({
      arquivado: true,
      nome: "Editado",
    });
    store.restaurarFunil("funnel");
    expect(store.listarFunis()[0].arquivado).toBe(false);
  });
  it("preserves both conflicting named versions, current local edits and binary source references", () => {
    const store = criarCofreFunil("remote"),
      other = criarCofreFunil("local");
    store.salvarFunil(fixture("Servidor"));
    other.salvarFunil({
      ...fixture("Local"),
      nodes: [
        {
          id: "n",
          type: "sales",
          title: "P",
          x: 0,
          y: 0,
          pagina: {
            caminho: "/",
            meta: {},
            saidas: {},
            zip: { nome: "site.zip", tamanho: 100, ok: true },
          },
        },
      ],
    });
    const merged = mergeFunnelEnvelopes(
      store.exportarEnvelope(),
      other.exportarEnvelope(),
    );
    expect(merged.rascunho?.nome).toBe("Local");
    expect(merged.funis.map((record) => record.nome)).toEqual(
      expect.arrayContaining(["Servidor", "Local (cópia local preservada)"]),
    );
    const copy = merged.funis.find((record) =>
      record.nome.startsWith("Local"),
    )!;
    expect(copy.data.nodes[0].pagina?.zip?.sourceFunnelId).toBe("funnel");
  });
  it("does not overwrite edits made while the initial cloud read is pending", async () => {
    vi.useFakeTimers();
    const remoteStore = criarCofreFunil("remote");
    remoteStore.salvarRascunho(fixture("Servidor"));
    const local = criarCofreFunil(funnelScopeId("user", "workspace"));
    let resolve!: (response: Response) => void;
    const network = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, revision: crypto.randomUUID() }),
        ),
      );
    vi.stubGlobal("fetch", network);
    const connection = connectFunnelCloud(
      funnelScopeId("user", "workspace"),
      local,
      vi.fn(),
      vi.fn(),
    );
    local.salvarRascunho(fixture("Editado durante download"));
    resolve(
      new Response(
        JSON.stringify({
          ok: true,
          revision: crypto.randomUUID(),
          envelope: remoteStore.exportarEnvelope(),
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(800);
    expect(local.lerRascunho()?.nome).toBe("Editado durante download");
    expect(
      local.listarFunis().some((record) => record.data.nome === "Servidor"),
    ).toBe(true);
    expect(network.mock.calls[1][1].headers).toMatchObject({
      "x-editor-workspace": "workspace",
      "x-editor-user": "user",
    });
    connection.stop();
  });
  it("predicts disjoint 90/10 active slices consistent with the simulator", () => {
    const rule = (
      id: string,
      percent: number,
      target: string,
      ativo = true,
    ): RegraRedir => ({
      id,
      tipo: "fatia",
      percentual: percent,
      destino: `/${target}`,
      destinoNoId: target,
      ativo,
      paises: [],
      dispositivos: [],
    });
    const regras = [
      rule("a", 90, "A"),
      rule("b", 10, "B"),
      rule("off", 100, "C", false),
    ];
    const nodes: FunnelNode[] = [
      {
        id: "r",
        type: "redirect",
        title: "R",
        x: 0,
        y: 0,
        redir: { regras },
        previsao: { visitas: 1000 },
      },
      ...["A", "B", "C"].map((id): FunnelNode => ({
        id,
        type: "thanks",
        title: id,
        x: 0,
        y: 0,
      })),
    ];
    const result = calcularPrevisao(
      nodes,
      regras.map((rule) => ({
        id: `rr:r:${rule.id}`,
        source: "r",
        target: rule.destinoNoId!,
      })),
      PREVISAO_PADRAO,
    );
    expect(result.porNo.A.entram).toBe(900);
    expect(result.porNo.B.entram).toBe(100);
    expect(result.porNo.C.entram).toBe(0);
    expect(
      decidirDestino(
        { id: "r", nome: "R", url: "/", regras },
        { pais: "BR", dispositivo: "desktop" },
        95,
      ).destino,
    ).toBe("/B");
  });
});
