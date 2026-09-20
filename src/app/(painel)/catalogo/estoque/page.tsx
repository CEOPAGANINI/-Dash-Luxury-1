import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Catálogo · Estoque" };

export default function EstoquePage() {
  return (
    <ModulePlaceholder
      title="Estoque"
      description="Controle de estoque por produto e variação, movimentações, estoque mínimo e alertas de esgotamento."
      phase={2}
    />
  );
}
