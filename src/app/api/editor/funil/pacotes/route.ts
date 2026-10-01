import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/database/client";
import { funnelPackages } from "@/database/schema/funnel-storage";
import { readLimitedBody } from "@/features/funnel/request-body";
import { inspecionarZip } from "@/features/vps/pacote-zip";
import { exigirWorkspaceRole, WorkspaceAccessError } from "@/lib/workspace";

export const runtime = "nodejs";
const id = z.string().min(1).max(300);
const scopeSchema = z.object({
  funnelId: id,
  nodeId: id,
  productId: z.string().max(300).default(""),
});
const roles = ["owner", "admin", "marketing"] as const;
const reject = (message: string, status: number) =>
  Response.json({ ok: false, error: message }, { status });
class PackageIdentityConflict extends Error {}
async function identity(request: Request) {
  const access = await exigirWorkspaceRole([...roles]);
  if (
    request.headers.get("x-editor-user") !== access.user.id ||
    request.headers.get("x-editor-workspace") !== access.workspaceId
  )
    throw new PackageIdentityConflict(
      "A conta ou workspace mudou. Reabra o editor.",
    );
  return access;
}
function scope(request: Request) {
  const query = new URL(request.url).searchParams;
  return scopeSchema.parse({
    funnelId: query.get("funnelId"),
    nodeId: query.get("nodeId"),
    productId: query.get("productId") ?? "",
  });
}
function owned(
  workspaceId: string,
  userId: string,
  value: z.infer<typeof scopeSchema>,
) {
  return and(
    eq(funnelPackages.workspaceId, workspaceId),
    eq(funnelPackages.userId, userId),
    eq(funnelPackages.funnelId, value.funnelId),
    eq(funnelPackages.nodeId, value.nodeId),
    eq(funnelPackages.productId, value.productId),
  );
}
function failure(error: unknown) {
  if (error instanceof PackageIdentityConflict)
    return reject(error.message, 409);
  if (error instanceof WorkspaceAccessError)
    return reject(error.message, error.status);
  if (error instanceof RangeError)
    return reject(
      "O ZIP deve ter até 3 MB e sua conta até 48 MB de arquivos.",
      413,
    );
  if (error instanceof z.ZodError)
    return reject("Identificação do pacote inválida.", 400);
  return reject(
    "Não foi possível acessar os arquivos da sua conta. A cópia desta aba foi preservada.",
    503,
  );
}
export async function GET(request: Request) {
  try {
    const { workspaceId, user } = await identity(request);
    if (new URL(request.url).searchParams.has("nodeId")) {
      const [item] = await getDb()
        .select()
        .from(funnelPackages)
        .where(owned(workspaceId, user.id, scope(request)))
        .limit(1);
      if (!item) return reject("Arquivo não encontrado nesta conta.", 404);
      return new Response(Uint8Array.from(item.content).buffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(item.sizeBytes),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const items = await getDb()
      .select({
        funnelId: funnelPackages.funnelId,
        nodeId: funnelPackages.nodeId,
        productId: funnelPackages.productId,
        filename: funnelPackages.filename,
        sizeBytes: funnelPackages.sizeBytes,
        sha256: funnelPackages.sha256,
      })
      .from(funnelPackages)
      .where(
        and(
          eq(funnelPackages.workspaceId, workspaceId),
          eq(funnelPackages.userId, user.id),
        ),
      );
    return Response.json(
      { ok: true, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reject("Origem inválida.", 403);
  try {
    const { workspaceId, user } = await identity(request);
    const value = scope(request);
    const content = Buffer.from(await readLimitedBody(request, 3_000_000));
    const checked = inspecionarZip(content);
    if (!checked.ok)
      return reject(
        "ZIP inválido. Confira index.html na raiz e use somente arquivos estáticos, sem PHP ou .htaccess.",
        400,
      );
    let filename: string;
    try {
      filename = decodeURIComponent(
        request.headers.get("x-file-name") ?? "pagina.zip",
      );
    } catch {
      return reject("Nome inválido.", 400);
    }
    if (!/^[^\x00-\x1f/\\]{1,200}\.zip$/i.test(filename))
      return reject("Nome de ZIP inválido.", 400);
    await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${user.id}:packages`}, 0))`,
      );
      const rows = await tx
        .select({
          size: funnelPackages.sizeBytes,
          funnelId: funnelPackages.funnelId,
          nodeId: funnelPackages.nodeId,
          productId: funnelPackages.productId,
        })
        .from(funnelPackages)
        .where(
          and(
            eq(funnelPackages.workspaceId, workspaceId),
            eq(funnelPackages.userId, user.id),
          ),
        );
      const used = rows.reduce(
        (sum, row) =>
          sum +
          (row.funnelId === value.funnelId &&
          row.nodeId === value.nodeId &&
          row.productId === value.productId
            ? 0
            : row.size),
        0,
      );
      const replacing = rows.some(
        (row) =>
          row.funnelId === value.funnelId &&
          row.nodeId === value.nodeId &&
          row.productId === value.productId,
      );
      if (
        used + content.length > 48_000_000 ||
        (!replacing && rows.length >= 400)
      )
        throw new RangeError();
      const data = {
        workspaceId,
        userId: user.id,
        ...value,
        filename,
        content,
        sizeBytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      };
      await tx
        .insert(funnelPackages)
        .values(data)
        .onConflictDoUpdate({
          target: [
            funnelPackages.workspaceId,
            funnelPackages.userId,
            funnelPackages.funnelId,
            funnelPackages.nodeId,
            funnelPackages.productId,
          ],
          set: {
            filename,
            content,
            sizeBytes: data.sizeBytes,
            sha256: data.sha256,
            updatedAt: new Date(),
          },
        });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reject("Origem inválida.", 403);
  try {
    const { workspaceId, user } = await identity(request);
    await getDb()
      .delete(funnelPackages)
      .where(owned(workspaceId, user.id, scope(request)));
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
