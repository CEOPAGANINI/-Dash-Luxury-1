import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { AgentView } from "@/features/ai-agent/agent-dashboard";
const sections: Record<string, { view: AgentView; title: string }> = {
  rascunhos: { view: "drafts", title: "Rascunhos" },
  historico: { view: "history", title: "Histórico" },
  configuracoes: { view: "settings", title: "Configurações" },
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: `Agente IA · ${sections[section]?.title ?? "Página"}` };
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections[section]) notFound();
  return null;
}
