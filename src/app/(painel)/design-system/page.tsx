import type { Metadata } from "next";

import { CommandLayerDesignSystem } from "@/features/command-layer/command-layer-design-system";

export const metadata: Metadata = {
  title: "Design system · CommandLayer",
  description:
    "O catálogo vivo do desenho do painel: cores, tipografia, componentes e estrutura, saindo das mesmas variáveis que o painel usa.",
};

export default function DesignSystemPage() {
  return <CommandLayerDesignSystem />;
}
