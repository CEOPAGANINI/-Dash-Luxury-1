// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({
  db: null as unknown,
  session: null as unknown,
  selected: undefined as string | undefined,
}));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => state.session,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.selected ? { value: state.selected } : undefined),
  }),
}));
import {
  getWorkspaceAccess,
  exigirWorkspaceRole,
  getPublicWorkspaceId,
} from "@/lib/workspace";
import { profiles, workspaces, workspaceMembers } from "@/database/schema";
import { criarBancoDeTeste, type BancoDeTeste } from "../helpers/pglite";
let banco: BancoDeTeste;
const owner = {
  id: "12345678-1234-4234-8234-123456789012",
  email: "owner@isolation.test",
  name: "Owner",
  emailConfirmado: true,
};
const viewer = {
  id: "12345678-1234-4234-8234-123456789013",
  email: "viewer@isolation.test",
  name: "Viewer",
  emailConfirmado: true,
};
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});
beforeEach(() => {
  state.session = null;
  state.selected = undefined;
  vi.stubEnv("VPS_DONOS", owner.email);
});

describe("authenticated workspace data boundary", () => {
  it("rejects anonymous and demo sessions without creating an operation", async () => {
    await expect(getWorkspaceAccess()).rejects.toMatchObject({ status: 401 });
    state.session = { user: owner, demoMode: true };
    await expect(getWorkspaceAccess()).rejects.toMatchObject({ status: 401 });
    expect(await banco.db.select().from(workspaces)).toHaveLength(0);
  });
  it("only the confirmed configured owner can claim the old system operation", async () => {
    const systemId = crypto.randomUUID();
    await banco.db
      .insert(profiles)
      .values({ id: systemId, email: "sistema@infinity.app" });
    const [legacy] = await banco.db
      .insert(workspaces)
      .values({ name: "Legacy", slug: "infinity-principal", ownerId: systemId })
      .returning();
    state.session = { user: viewer, demoMode: false };
    const other = await getWorkspaceAccess();
    expect(other.workspaceId).not.toBe(legacy.id);
    state.session = { user: owner, demoMode: false };
    const access = await getWorkspaceAccess();
    expect(access.workspaceId).toBe(legacy.id);
    expect(access.role).toBe("owner");
    const [record] = await banco.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, legacy.id));
    expect(record.ownerId).toBe(owner.id);
    expect(await getPublicWorkspaceId()).toBe(legacy.id);
  });
  it("a forged workspace selection cannot grant access to another operation", async () => {
    state.session = { user: viewer, demoMode: false };
    const privateAccess = await getWorkspaceAccess();
    state.session = { user: owner, demoMode: false };
    state.selected = privateAccess.workspaceId;
    const result = await getWorkspaceAccess();
    expect(result.workspaceId).not.toBe(privateAccess.workspaceId);
  });
  it("active viewer membership allows reading but not configuration writes; suspension is checked again", async () => {
    state.session = { user: owner, demoMode: false };
    const owned = await getWorkspaceAccess();
    await banco.db.insert(workspaceMembers).values({
      workspaceId: owned.workspaceId,
      profileId: viewer.id,
      role: "viewer",
    });
    state.session = { user: viewer, demoMode: false };
    state.selected = owned.workspaceId;
    expect((await getWorkspaceAccess()).role).toBe("viewer");
    await expect(exigirWorkspaceRole(["finance"])).rejects.toMatchObject({
      status: 403,
    });
    await banco.db
      .update(workspaceMembers)
      .set({ isActive: false })
      .where(eq(workspaceMembers.workspaceId, owned.workspaceId));
    expect((await getWorkspaceAccess()).workspaceId).not.toBe(
      owned.workspaceId,
    );
  });
  it("does not reactivate a suspended owner while resolving an existing operation", async () => {
    state.session = { user: owner, demoMode: false };
    await expect(getWorkspaceAccess()).rejects.toMatchObject({ status: 403 });
    const memberships = await banco.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.profileId, owner.id));
    expect(memberships.every((item) => !item.isActive)).toBe(true);
  });
});
