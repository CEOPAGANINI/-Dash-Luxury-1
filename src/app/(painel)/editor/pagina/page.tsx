import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LandingFlowEditor } from "@/features/landing-editor/landing-flow-editor";

export const metadata: Metadata = { title: "Editor de conteúdo · Orbit" };

/**
 * O editor de conteúdo e ZIP de cada página do funil. Antes vivia em
 * /editor/landing-page; agora essa rota é o quadro do funil e este editor
 * fica aqui, aberto pelo botão "Editar" de um card de página do quadro.
 * É ele que monta o HTML de cada página e exporta o ZIP publicado no
 * Servidor → Sites.
 */
export default async function EditorDeConteudoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <LandingFlowEditor storageId={session.user.id} />;
}
