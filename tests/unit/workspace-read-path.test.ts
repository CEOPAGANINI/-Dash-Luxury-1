// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  db: null as unknown,
  selected: undefined as string | undefined,
  session: null as unknown,
}));
vi.mock("@/database/client", () => ({ getDb: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => state.session,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.selected ? { value: state.selected } : undefined),
  }),
}));

import { getWorkspaceAccess } from "@/lib/workspace";

const user = {
  id: "12345678-1234-4234-8234-123456789012",
  email: "member@read-path.test",
  name: "Member",
  emailConfirmado: true,
};
type Membership = { workspaceId: string; role: "viewer" | "owner" | "admin" };

function readDb(responses: Membership[][]) {
  const predicates: SQL[] = [];
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn((predicate: SQL) => {
      predicates.push(predicate);
      return builder;
    }),
    orderBy: vi.fn(async () => responses.shift() ?? []),
  };
  const select = vi.fn(() => builder);
  const insert = vi.fn(() => {
    throw new Error("The membership read must not write a profile.");
  });
  const execute = vi.fn(async () => []);
  const tx = { select, insert, execute };
  const transaction = vi.fn(
    async (callback: (transactionClient: typeof tx) => unknown) => callback(tx),
  );
  return { select, insert, transaction, execute, predicates };
}

beforeEach(() => {
  state.selected = undefined;
  state.session = { user, demoMode: false };
});

describe("read-only existing workspace access", () => {
  it("does not acquire a transaction lock or update profiles for an active member", async () => {
    const db = readDb([[{ workspaceId: "active", role: "viewer" }]]);
    state.db = db;
    expect(await getWorkspaceAccess()).toEqual({
      workspaceId: "active",
      role: "viewer",
      user,
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("binds membership to the authenticated user, active status and a non-deleted operation", async () => {
    const db = readDb([[{ workspaceId: "active", role: "viewer" }]]);
    state.db = db;
    await getWorkspaceAccess();
    const query = new PgDialect().sqlToQuery(db.predicates[0]);
    expect(query.sql).toContain('"workspace_members"."profile_id"');
    expect(query.sql).toContain('"workspace_members"."is_active"');
    expect(query.sql).toContain('"workspaces"."deleted_at" is null');
    expect(query.params).toEqual([user.id, true]);
  });

  it("honors only an active membership from the selected workspace cookie", async () => {
    const db = readDb([
      [
        { workspaceId: "oldest", role: "viewer" },
        { workspaceId: "selected", role: "admin" },
      ],
    ]);
    state.db = db;
    state.selected = "selected";
    expect(await getWorkspaceAccess()).toMatchObject({
      workspaceId: "selected",
      role: "admin",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("a forged or suspended workspace cookie cannot grant another role", async () => {
    const db = readDb([[{ workspaceId: "oldest", role: "viewer" }]]);
    state.db = db;
    state.selected = "foreign-or-suspended";
    expect(await getWorkspaceAccess()).toMatchObject({
      workspaceId: "oldest",
      role: "viewer",
    });
  });

  it("rechecks after the bootstrap lock and avoids writes if another request created membership", async () => {
    const db = readDb([
      [],
      [{ workspaceId: "created-in-parallel", role: "owner" }],
    ]);
    state.db = db;
    expect(await getWorkspaceAccess()).toMatchObject({
      workspaceId: "created-in-parallel",
      role: "owner",
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
