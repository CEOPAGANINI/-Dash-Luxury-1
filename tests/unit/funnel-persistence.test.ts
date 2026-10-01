import { describe, expect, it, vi } from "vitest";

import { FUNIL_DEMO } from "@/features/funnel/funnel-demo";
import type { FunnelData } from "@/features/funnel/funnel-model";
import {
  CHAVES_LEGADAS_FUNIL,
  criarCofreFunil,
  funnelClipboardKey,
  funnelStorageKey,
} from "@/features/funnel/funil-store";
import { validarFunnelData } from "@/features/funnel/funnel-validation";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

const data = (): FunnelData => JSON.parse(JSON.stringify(FUNIL_DEMO));

describe("account-scoped funnel persistence", () => {
  it("keeps drafts, vaults, redirects and clipboard keys separate for two accounts", () => {
    const storage = memory();
    const a = criarCofreFunil("user-a", storage);
    const b = criarCofreFunil("user-b", storage);
    a.salvarFunil(data(), "Privado A");
    a.salvarRedir("Destino A", { destino: "/oferta" });
    expect(b.lerRascunho()).toBeNull();
    expect(b.listarFunis()).toEqual([]);
    expect(b.listarRedirs()).toEqual([]);
    b.salvarFunil({ ...data(), id: "b" }, "Privado B");
    expect(
      criarCofreFunil("user-a", storage)
        .listarFunis()
        .map((f) => f.nome),
    ).toEqual(["Privado A"]);
    expect(funnelClipboardKey("user-a")).not.toBe(funnelClipboardKey("user-b"));
  });

  it("requires authenticated identity", () => {
    expect(() => criarCofreFunil(" ", memory())).toThrow(/entrar na conta/);
  });

  it("does not save anything while reading or mounting a blank account", () => {
    const storage = memory();
    const store = criarCofreFunil("a", storage);
    store.lerRascunho();
    store.listarFunis();
    store.legadoDisponivel();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("commits vault and draft together in one storage write", () => {
    const storage = memory();
    criarCofreFunil("a", storage).salvarFunil(data(), "Campanha");
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const remount = criarCofreFunil("a", storage);
    expect(remount.lerRascunho()?.nome).toBe("Campanha");
    expect(remount.listarFunis()[0].nome).toBe("Campanha");
  });

  it("reports quota failure without confirming success or altering memory/storage", () => {
    const storage = memory();
    const store = criarCofreFunil("a", storage);
    store.salvarFunil(data(), "Anterior");
    const before = storage.getItem(store.chave);
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => store.salvarFunil(data(), "Novo")).toThrow(
      /Não foi possível salvar/,
    );
    expect(storage.getItem(store.chave)).toBe(before);
    expect(store.listarFunis()[0].nome).toBe("Anterior");
  });

  it("reports unavailable storage instead of treating it as an empty vault", () => {
    const storage = memory();
    storage.getItem.mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const store = criarCofreFunil("a", storage);
    expect(() => store.listarFunis()).toThrow(/Não foi possível ler/);
    expect(() => store.salvarFunil(data())).toThrow(/Não foi possível ler/);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("never opens or claims unscoped legacy drafts automatically", () => {
    const storage = memory();
    storage.setItem(CHAVES_LEGADAS_FUNIL[0], JSON.stringify(data()));
    const store = criarCofreFunil("a", storage);
    expect(store.legadoDisponivel()).toBe(true);
    expect(store.lerRascunho()).toBeNull();
    expect(store.listarFunis()).toEqual([]);
    expect(() => store.importarLegado(false)).toThrow(/Confirme/);
    expect(storage.getItem(funnelStorageKey("a"))).toBeNull();
  });

  it("imports only after confirmation, preserving all originals and account records", () => {
    const storage = memory();
    const original = JSON.stringify(data());
    storage.setItem(CHAVES_LEGADAS_FUNIL[0], original);
    const store = criarCofreFunil("a", storage);
    store.salvarFunil(data(), "Meu funil novo");
    expect(store.importarLegado(true)).toBe(1);
    const saved = store.listarFunis();
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((f) => f.id)).size).toBe(2);
    expect(store.lerRascunho()?.nome).toBe("Meu funil novo");
    expect(storage.getItem(CHAVES_LEGADAS_FUNIL[0])).toBe(original);
    expect(criarCofreFunil("b", storage).listarFunis()).toEqual([]);
  });

  it("rejects malformed legacy data without partial import or deleting originals", () => {
    const storage = memory();
    storage.setItem(CHAVES_LEGADAS_FUNIL[0], JSON.stringify(data()));
    storage.setItem(CHAVES_LEGADAS_FUNIL[1], "[{oops");
    const store = criarCofreFunil("a", storage);
    expect(() => store.importarLegado(true)).toThrow(
      /Nenhum dado antigo foi apagado/,
    );
    expect(storage.getItem(store.chave)).toBeNull();
    expect(storage.getItem(CHAVES_LEGADAS_FUNIL[1])).toBe("[{oops");
  });

  it("keeps distinct legacy draft and vault versions even when their ids match", () => {
    const storage = memory();
    storage.setItem(
      CHAVES_LEGADAS_FUNIL[0],
      JSON.stringify({ ...data(), nome: "Mais recente" }),
    );
    storage.setItem(
      CHAVES_LEGADAS_FUNIL[1],
      JSON.stringify([
        {
          id: data().id,
          nome: data().nome,
          atualizadoEm: new Date().toISOString(),
          data: data(),
        },
      ]),
    );
    const store = criarCofreFunil("a", storage);
    expect(store.importarLegado(true)).toBe(2);
    expect(store.listarFunis().map((f) => f.nome)).toContain(
      "Mais recente (rascunho antigo)",
    );
    expect(storage.getItem(CHAVES_LEGADAS_FUNIL[0])).not.toBeNull();
  });

  it("does not overwrite a corrupt account envelope", () => {
    const storage = memory();
    storage.setItem(funnelStorageKey("a"), '{"versao":1,"funis":"bad"}');
    const before = storage.getItem(funnelStorageKey("a"));
    const store = criarCofreFunil("a", storage);
    expect(() => store.lerRascunho()).toThrow(/corrompido/);
    expect(() => store.salvarFunil(data())).toThrow(/corrompido/);
    expect(storage.getItem(funnelStorageKey("a"))).toBe(before);
  });

  it("blocks stale-tab saves, including after reading its cached list", () => {
    const storage = memory();
    const first = criarCofreFunil("a", storage);
    const second = criarCofreFunil("a", storage);
    first.lerRascunho();
    second.lerRascunho();
    first.salvarFunil(data(), "Aba 1");
    expect(second.listarFunis()).toEqual([]);
    expect(() => second.salvarFunil(data(), "Aba 2")).toThrow(/Outra aba/);
    expect(criarCofreFunil("a", storage).lerRascunho()?.nome).toBe("Aba 1");
  });

  it("blocks stale-tab deletes and legacy imports too", () => {
    const storage = memory();
    const first = criarCofreFunil("a", storage);
    first.salvarFunil(data());
    const second = criarCofreFunil("a", storage);
    second.lerRascunho();
    first.salvarFunil(data(), "Novo");
    expect(() => second.removerRascunho()).toThrow(/Outra aba/);
    expect(() => second.removerFunil(data().id)).toThrow(/Outra aba/);
    expect(() => second.importarLegado(true)).toThrow(/Outra aba/);
  });

  it("duplicates the vault entry without changing the active draft", () => {
    const store = criarCofreFunil("a", memory());
    store.salvarFunil(data());
    const copy = store.duplicarFunil(data().id)!;
    expect(copy.id).not.toBe(data().id);
    expect(copy.id).toBe(copy.data.id);
    expect(store.lerRascunho()?.id).toBe(data().id);
  });

  it("marks old ZIP metadata unready when reopening pages or products", () => {
    const value = data();
    value.nodes[0].pagina = {
      caminho: "/",
      meta: {},
      saidas: {},
      zip: { nome: "x.zip", tamanho: 20, ok: true },
    };
    value.nodes[0].loja = {
      plataforma: "vps",
      moeda: "BRL",
      produtos: [
        {
          id: "p",
          nome: "P",
          preco: 1,
          caminho: "/p",
          ativo: true,
          zip: { nome: "p.zip", tamanho: 20, ok: true },
        },
      ],
    };
    const store = criarCofreFunil("a", memory());
    store.salvarFunil(value);
    expect(store.lerRascunho()?.nodes[0].pagina?.zip?.ok).toBe(false);
    expect(store.listarFunis()[0].data.nodes[0].loja?.produtos[0].zip?.ok).toBe(
      false,
    );
  });
});

describe("runtime funnel validation", () => {
  it("accepts the current rich demo without dropping configured fields", () => {
    expect(validarFunnelData(data())).toEqual(data());
  });

  it.each([
    (d: FunnelData) => {
      d.nodes[0].x = Number.NaN;
    },
    (d: FunnelData) => {
      d.nodes[0].type = "not-a-node" as never;
    },
    (d: FunnelData) => {
      d.nodes[0].title = null as never;
    },
    (d: FunnelData) => {
      d.nodes.push(d.nodes[0]);
    },
    (d: FunnelData) => {
      d.edges.push({ id: "broken", source: "absent", target: d.nodes[0].id });
    },
    (d: FunnelData) => {
      d.nodes[0].pagina = {
        caminho: "/",
        meta: {},
        saidas: { comprar: null as never },
      };
    },
    (d: FunnelData) => {
      d.nodes[0].redir = { regras: [{ id: "bad" } as never] };
    },
    (d: FunnelData) => {
      d.nodes[0].loja = {
        plataforma: "vps",
        moeda: "BRL",
        produtos: "bad" as never,
      };
    },
    (d: FunnelData) => {
      d.nodes[0].id = "__proto__";
    },
  ])("rejects malformed persisted state before rendering", (mutate) => {
    const value = data();
    mutate(value);
    expect(() => validarFunnelData(value)).toThrow(/inválido ou corrompido/);
  });
});
