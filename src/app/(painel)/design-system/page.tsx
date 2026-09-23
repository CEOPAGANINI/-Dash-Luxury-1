import type { Metadata } from "next";

import { OrbitDesignSystem } from "@/features/orbit/orbit-design-system";

export const metadata: Metadata = {
  title: "Design system · Orbit · Nebula",
  description:
    "O catálogo vivo do desenho do painel: cores, tipografia, componentes e estrutura, saindo das mesmas variáveis que o painel usa.",
};

export default function DesignSystemPage() {
  return <OrbitDesignSystem />;
}
