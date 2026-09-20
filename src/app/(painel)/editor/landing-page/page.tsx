import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Editor · Landing page" };

export default function EditorLandingPage() {
  return (
    <ModulePlaceholder
      title="Editor de landing page"
      description="Editor por blocos com templates (produto físico, digital, captura, oferta), preview responsivo, SEO e publicação em /p/[slug]."
      phase={8}
    />
  );
}
