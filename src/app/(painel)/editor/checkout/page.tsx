import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Editor · Checkout" };

export default function EditorCheckoutPage() {
  return (
    <ModulePlaceholder
      title="Editor de checkout"
      description="Personalização completa do checkout: campos, aparência, order bump, depoimentos, selos, pixels e preview ao vivo em desktop/tablet/celular."
      phase={3}
    />
  );
}
