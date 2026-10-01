import { exigirWorkspaceRole, WorkspaceAccessError } from "@/lib/workspace";
import {
  cloudSaveSchema,
  CLOUD_BODY_MAX_BYTES,
} from "@/features/funnel/cloud-contract";
import {
  readCloudVault,
  writeCloudVault,
  listCloudHistory,
  readCloudHistory,
  FunnelCloudConflict,
} from "@/features/funnel/cloud-server";
import { z } from "zod";
import { readLimitedBody } from "@/features/funnel/request-body";

export const runtime = "nodejs";
const roles = ["owner", "admin", "marketing"] as const;
const failure = (error: unknown) =>
  Response.json(
    {
      ok: false,
      error:
        error instanceof FunnelCloudConflict ||
        error instanceof WorkspaceAccessError
          ? error.message
          : error instanceof SyntaxError
            ? "JSON inválido."
            : error instanceof RangeError
              ? "O cofre excede 3 MB."
              : "Não foi possível sincronizar o funil. A cópia deste navegador foi preservada.",
    },
    {
      status:
        error instanceof WorkspaceAccessError
          ? error.status
          : error instanceof FunnelCloudConflict
            ? 409
            : error instanceof SyntaxError
              ? 400
              : error instanceof RangeError
                ? 413
                : 503,
    },
  );

export async function GET(request: Request) {
  try {
    const { workspaceId, user } = await exigirWorkspaceRole([...roles]);
    if (
      request.headers.get("x-editor-user") !== user.id ||
      request.headers.get("x-editor-workspace") !== workspaceId
    )
      return Response.json(
        {
          ok: false,
          error:
            "A conta ou workspace mudou. Reabra o editor para sincronizar.",
        },
        { status: 409 },
      );
    const query = new URL(request.url).searchParams;
    if (query.has("revision")) {
      const revision = z.uuid().safeParse(query.get("revision"));
      if (!revision.success)
        return Response.json(
          { ok: false, error: "Versão inválida." },
          { status: 400 },
        );
      const envelope = await readCloudHistory(
        workspaceId,
        user.id,
        revision.data,
      );
      if (!envelope)
        return Response.json(
          {
            ok: false,
            error: "Versão não encontrada nesta conta e workspace.",
          },
          { status: 404 },
        );
      return Response.json(
        { ok: true, envelope },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (query.get("history") === "1")
      return Response.json(
        { ok: true, items: await listCloudHistory(workspaceId, user.id) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    return Response.json(
      { ok: true, ...(await readCloudVault(workspaceId, user.id)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { ok: false, error: "Origem inválida." },
      { status: 403 },
    );
  try {
    const { workspaceId, user } = await exigirWorkspaceRole([...roles]);
    if (
      request.headers.get("x-editor-user") !== user.id ||
      request.headers.get("x-editor-workspace") !== workspaceId
    )
      return Response.json(
        {
          ok: false,
          error:
            "A conta ou workspace mudou. Reabra o editor para sincronizar.",
        },
        { status: 409 },
      );
    if (Number(request.headers.get("content-length")) > CLOUD_BODY_MAX_BYTES)
      return Response.json(
        {
          ok: false,
          error:
            "O cofre excede 3 MB. Remova cópias antigas antes de sincronizar.",
        },
        { status: 413 },
      );
    const raw = new TextDecoder().decode(
      await readLimitedBody(request, CLOUD_BODY_MAX_BYTES),
    );
    const parsed = cloudSaveSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json(
        { ok: false, error: "Dados de funil inválidos." },
        { status: 400 },
      );
    return Response.json({
      ok: true,
      ...(await writeCloudVault(
        workspaceId,
        user.id,
        parsed.data.revision,
        parsed.data.envelope,
      )),
    });
  } catch (error) {
    return failure(error);
  }
}
