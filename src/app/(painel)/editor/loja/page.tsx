import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";
import { createStoreFunnel } from "@/features/funnel/store-template";
import { getWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Editor · Loja" };

export const dynamic = "force-dynamic";
export default async function EditorLojaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const access = session.demoMode ? null : await getWorkspaceAccess();
  return (
    <>
      <h1 className="sr-only">Editor da loja e funil</h1>
      <div className="funnel-stage">
        <FunnelBoardClient
          storageId={session.user.id}
          workspaceId={access?.workspaceId}
          inicial={createStoreFunnel()}
          focoTipo="store"
          initialPanel="lista"
        />
      </div>
    </>
  );
}
