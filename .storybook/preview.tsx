import type { Preview } from "@storybook/nextjs-vite";
import "./api-guard";

import "../src/app/globals.css";
import "../src/app/command-layer.css";
import "../src/features/funnel/funnel.css";
import "../src/features/funnel/flow-tokens.css";
import "../src/features/funnel/flow-design-system.css";
import "./preview.css";

const preview: Preview = {
  globalTypes: {
    flowTheme: {
      description: "Tema do quadro Flow",
      toolbar: {
        title: "Tema Flow",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "preto", title: "Escuro" },
          { value: "papel", title: "Papel" },
          { value: "azul", title: "Azul" },
          { value: "grafite", title: "Grafite" },
        ],
      },
    },
  },
  initialGlobals: { flowTheme: "preto" },
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    a11y: { test: "error" },
    docs: {
      description: {
        component:
          "Componentes reais do quadro Flow em isolamento. Dados e estados das histórias são exemplos locais; nenhuma história salva ou publica no backend.",
      },
    },
  },
  decorators: [
    (Story, context) => (
      <div
        className="funnel flow-storybook"
        data-tema={context.globals.flowTheme}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
