import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Catálogo · Cupons" };

export default function CuponsPage() {
  return (
    <ModulePlaceholder
      title="Cupons"
      description="Cupons percentuais e de valor fixo com validade, limites de uso, produtos permitidos e valor mínimo."
      phase={3}
    />
  );
}
