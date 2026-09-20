import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Catálogo · Categorias" };

export default function CategoriasPage() {
  return (
    <ModulePlaceholder
      title="Categorias"
      description="Organização do catálogo em categorias com slug, SEO e vínculo a produtos e landing pages."
      phase={2}
    />
  );
}
