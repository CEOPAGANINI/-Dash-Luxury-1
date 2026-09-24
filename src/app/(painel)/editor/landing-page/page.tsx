import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LandingFlowEditor } from "@/features/landing-editor/landing-flow-editor";

export const metadata: Metadata = { title: "Editor de páginas · Orbit" };

export default async function EditorLandingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <LandingFlowEditor storageId={session.user.id} />;
}
