import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Editor · Loja" };

export default function EditorLojaPage() {
  return (
    <ModulePlaceholder
      title="Editor da loja"
      description="Editor visual por blocos para a loja pública: cabeçalho, hero, produtos, depoimentos, FAQ, rodapé — com autosave, histórico de versões e publicação."
      phase={8}
    />
  );
}
