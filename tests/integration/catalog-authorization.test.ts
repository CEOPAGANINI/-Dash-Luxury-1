// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  denied: true,
  roleCheck: vi.fn(),
  db: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/database/client", () => ({
  isDatabaseConfigured: () => true,
  getDb: state.db,
}));
vi.mock("@/lib/workspace", () => {
  class WorkspaceAccessError extends Error {}
  return {
    WorkspaceAccessError,
    exigirWorkspaceRole: async (roles: string[]) => {
      state.roleCheck(roles);
      if (state.denied)
        throw new WorkspaceAccessError(
          "Sua função não pode alterar este catálogo.",
        );
      return {
        workspaceId: crypto.randomUUID(),
        user: { id: crypto.randomUUID() },
      };
    },
  };
});

import {
  adjustStockAction,
  archiveCatalogAction,
  saveCategoryAction,
  saveProductAction,
} from "@/features/catalog/actions";

beforeEach(() => {
  state.denied = true;
  vi.clearAllMocks();
});
describe("autoridade para alterar catálogo", () => {
  it.each([
    saveProductAction,
    saveCategoryAction,
    archiveCatalogAction,
    adjustStockAction,
  ])(
    "rejeita consulta somente leitura antes de adquirir o banco",
    async (action) => {
      const result = await action(null, new FormData());
      expect(result).toEqual({
        ok: false,
        message: "Sua função não pode alterar este catálogo.",
      });
      expect(state.roleCheck).toHaveBeenCalledWith(["marketing", "finance"]);
      expect(state.db).not.toHaveBeenCalled();
    },
  );

  it("valida formulário autorizado antes de iniciar qualquer alteração", async () => {
    state.denied = false;
    const result = await saveProductAction(null, new FormData());
    expect(result.ok).toBe(false);
    expect(state.db).not.toHaveBeenCalled();
  });
});
