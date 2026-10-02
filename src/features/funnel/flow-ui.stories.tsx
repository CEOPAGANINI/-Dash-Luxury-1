import { useId, useState } from "react";
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRight, Copy, LayoutPanelTop, Save, Trash2 } from "lucide-react";

import {
  FlowButton,
  FlowConfirmDialog,
  FlowField,
  FlowIconButton,
  FlowSelect,
  FlowStatusBadge,
  type FlowTone,
} from "./flow-ui";
import { FunnelBoard } from "./funnel-board";
import { FlowInspector } from "./flow-inspector";
import { RedirectPanel } from "./redirect-panel";
import { PageVpsPublisher } from "./page-vps-publisher";
import { FunnelSitePublisher } from "./funnel-site-publisher";
import { criarCofreFunil } from "./funil-store";
import { regraRedirNova } from "./redirect-rules";
import type { FunnelData, FunnelNode, EstiloMapa } from "./funnel-model";

type GalleryArgs = { disabled: boolean; busy: boolean; tone: FlowTone };

function FlowGallery({ disabled, busy, tone }: GalleryArgs) {
  const id = useId();
  return (
    <div className="flow-story-grid">
      <h2>Componentes Flow</h2>
      <p>Exemplos locais. As ações não salvam nem publicam dados da conta.</p>
      <div className="flow-story-group">
        <FlowButton variant="primary" disabled={disabled}>
          <Save size={16} aria-hidden />
          Salvar alterações
        </FlowButton>
        <FlowButton disabled={disabled}>
          Revisar funil
          <ArrowRight size={16} aria-hidden />
        </FlowButton>
        <FlowButton variant="danger" disabled={disabled}>
          <Trash2 size={16} aria-hidden />
          Remover etapa
        </FlowButton>
        <FlowIconButton label="Duplicar etapa" disabled={disabled}>
          <Copy size={16} aria-hidden />
        </FlowIconButton>
      </div>
      <FlowStatusBadge tone={tone} busy={busy}>
        {busy ? "Salvando exemplo…" : "Estado do exemplo"}
      </FlowStatusBadge>
      <div className="flow-story-fields">
        <FlowField
          id={`${id}-path`}
          label="Caminho público"
          defaultValue="/oferta"
          help="Comece com / e use um caminho exclusivo no funil."
          disabled={disabled}
        />
        <FlowSelect
          id={`${id}-destination`}
          label="Destino padrão"
          help="Usado quando nenhuma regra corresponde."
          disabled={disabled}
          defaultValue="checkout"
        >
          <option value="checkout">Checkout principal</option>
          <option value="landing">Página de vendas</option>
        </FlowSelect>
      </div>
    </div>
  );
}

const meta = {
  title: "Flow/Design system",
  component: FlowGallery,
  tags: ["autodocs"],
  args: { disabled: false, busy: false, tone: "neutral" },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "success", "warning", "danger", "info"],
    },
    disabled: { control: "boolean" },
    busy: { control: "boolean" },
  },
} satisfies Meta<typeof FlowGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Componentes: Story = {};

export const ControlesDesabilitados: Story = {
  args: { disabled: true },
  parameters: {
    docs: {
      description: {
        story:
          "Controles desabilitados preservam texto legível e impedem interação.",
      },
    },
  },
};

export const Salvando: Story = {
  args: { busy: true, tone: "info" },
  parameters: {
    docs: {
      description: {
        story:
          "O indicador de atividade respeita prefers-reduced-motion. Esse estado é somente uma demonstração.",
      },
    },
  },
};

export const Estados: Story = {
  render: () => (
    <div className="flow-story-grid">
      <h2>Estados independentes</h2>
      <p>
        Configuração, sincronização e publicação representam operações
        diferentes.
      </p>
      <div className="flow-story-group">
        <FlowStatusBadge>Rascunho</FlowStatusBadge>
        <FlowStatusBadge tone="warning">Configuração pendente</FlowStatusBadge>
        <FlowStatusBadge tone="success">Configuração pronta</FlowStatusBadge>
        <FlowStatusBadge tone="info">Publicado — exemplo</FlowStatusBadge>
        <FlowStatusBadge tone="danger">Falha ao sincronizar</FlowStatusBadge>
      </div>
      <FlowStatusBadge tone="info" busy>
        Sincronizando exemplo…
      </FlowStatusBadge>
    </div>
  ),
};

function ValidationFields() {
  const id = useId();
  return (
    <div className="flow-story-grid">
      <h2>Validação contextual</h2>
      <FlowField
        id={`${id}-path-error`}
        label="Caminho público"
        defaultValue="oferta"
        help="O caminho precisa começar com /."
        error="Adicione / antes de oferta."
      />
      <FlowField
        id={`${id}-valid`}
        label="Nome da etapa"
        defaultValue="Checkout principal"
        help="Seu texto permanece no campo quando ocorre um erro."
      />
    </div>
  );
}

export const CampoComErro: Story = { render: () => <ValidationFields /> };

type CardState = "draft" | "ready" | "error";

function CardExample({
  state,
  compact = false,
  selected = false,
}: {
  state: CardState;
  compact?: boolean;
  selected?: boolean;
}) {
  const ready = state === "ready";
  const completed = ready ? 4 : 2;
  const tone: FlowTone = ready
    ? "success"
    : state === "error"
      ? "danger"
      : "warning";
  const label = ready
    ? "Pronto"
    : state === "error"
      ? "Destino inválido"
      : "Em preparação";
  return (
    <div className="flow-story-grid">
      <p>
        Card de referência com configuração fictícia. O progresso real do quadro
        é calculado pelo modelo da etapa.
      </p>
      <div className="flow-story-card">
        <div
          className="funnel__node"
          data-compact={compact}
          data-selected={selected}
        >
          <article className="funnel__node-shell">
            <header className="funnel__node-head">
              <span className="funnel__node-icon" aria-hidden>
                <LayoutPanelTop size={18} strokeWidth={1.75} />
              </span>
              <span className="funnel__node-kind">Página de vendas</span>
              <span className="funnel__node-badge">02</span>
            </header>
            <button
              type="button"
              className="funnel__node-body"
              aria-label="Configurar página de vendas de exemplo"
            >
              <span className="funnel__node-name">Oferta principal</span>
              <span className="funnel__node-headline">
                Uma etapa com hierarquia, estado e próxima ação claros.
              </span>
              <span className="funnel__node-url">/oferta</span>
              <span className="funnel__node-checklist">
                <span className="funnel__node-progress-label">
                  Configuração<b>{completed}/4 itens</b>
                </span>
                <span
                  className="funnel__node-progress"
                  role="progressbar"
                  aria-label="Configuração do exemplo"
                  aria-valuemin={0}
                  aria-valuemax={4}
                  aria-valuenow={completed}
                >
                  <span style={{ width: `${completed * 25}%` }} />
                </span>
                <span className="funnel__node-checks">
                  {["Conteúdo", "Caminho", "Arquivo ZIP", "Próxima etapa"].map(
                    (item, index) => (
                      <span key={item} data-done={index < completed}>
                        <span aria-hidden>{index < completed ? "✓" : "○"}</span>
                        {item}
                      </span>
                    ),
                  )}
                </span>
              </span>
            </button>
            <footer className="funnel__node-foot">
              <FlowStatusBadge tone={tone}>{label}</FlowStatusBadge>
              <span>1 ligação</span>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}

export const CardEmPreparacao: Story = {
  render: () => <CardExample state="draft" />,
};
export const CardProntoSelecionado: Story = {
  render: () => <CardExample state="ready" selected />,
};
export const CardComErro: Story = {
  render: () => <CardExample state="error" />,
};
export const CardCompacto: Story = {
  render: () => <CardExample state="ready" compact />,
  parameters: {
    docs: {
      description: {
        story:
          "Abaixo de 60% de zoom, o card mantém tipo, título e estado e esconde apenas os resumos secundários. Essa história apresenta o conteúdo compacto sem aplicar escala visual.",
      },
    },
  },
};

export const RoteadorEstados: Story = {
  render: () => (
    <div className="flow-story-grid flow-story-rule">
      <h2>Regras e alternativa</h2>
      <div className="rdp__default">
        <div>
          <span className="rdp__lbl">Destino padrão</span>
          <strong>Checkout principal</strong>
          <p>Recebe quem não corresponde a nenhuma regra.</p>
        </div>
      </div>
      <div className="rdp__rule-state" data-state="ready">
        <span>Ativa</span>
        <span>Destino configurado</span>
      </div>
      <div className="rdp__rule-state" data-state="pending">
        <span>Ativa</span>
        <span>Destino pendente</span>
      </div>
      <div className="rdp__rule-state" data-off>
        <span>Pausada</span>
        <span>Destino configurado</span>
      </div>
      <p className="rdp__notice rdp__notice--warning">
        Uma regra de região ativa bloqueia a exportação do ZIP único.
      </p>
      <p className="rdp__notice rdp__notice--danger">
        Destino não encontrado. Selecione uma etapa existente.
      </p>
      <p className="rdp__demo">Simulação — não são dados reais.</p>
    </div>
  ),
};

const colors = [
  ["canvas", "Área de trabalho"],
  ["surface", "Painéis"],
  ["surface-raised", "Cards"],
  ["surface-hover", "Hover"],
  ["border", "Separadores"],
  ["border-functional", "Controles"],
  ["text", "Texto principal"],
  ["text-secondary", "Texto secundário"],
  ["primary", "Ação / confirmação"],
  ["info", "Informação"],
  ["warning", "Pendência"],
  ["danger", "Erro"],
  ["routing", "Roteamento"],
] as const;

export const Tokens: Story = {
  render: () => (
    <div className="flow-story-grid">
      <h2>Tokens semânticos</h2>
      <p>
        Use o seletor Tema Flow para conferir Escuro, Papel, Azul e Grafite.
      </p>
      <div className="flow-story-token-grid">
        {colors.map(([token, label]) => (
          <figure key={token} className="flow-story-token">
            <div
              className="flow-story-swatch"
              style={{ background: `var(--flow-${token})` } as CSSProperties}
              aria-hidden
            />
            <figcaption>
              {label}
              <code>--flow-{token}</code>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  ),
};

function exampleFunnel(theme: EstiloMapa["tema"] = "padrao"): FunnelData {
  return {
    id: "storybook-flow",
    nome: "Oferta principal — exemplo local",
    projeto: "Storybook",
    mapa: { tema: theme },
    nodes: [
      {
        id: "landing",
        type: "sales",
        x: 80,
        y: 80,
        title: "Página de vendas",
        headline: "Conheça a oferta principal",
        url: "/oferta",
        pagina: { caminho: "/oferta", meta: {}, saidas: {} },
      },
      {
        id: "router",
        type: "redirect",
        x: 440,
        y: 80,
        title: "Roteador de ofertas",
        url: "/go",
        redir: {
          regras: [
            {
              ...regraRedirNova("mobile", "dispositivo"),
              dispositivos: ["mobile"],
              destinoNoId: "checkout",
            },
          ],
        },
      },
      {
        id: "checkout",
        type: "checkout",
        x: 800,
        y: 80,
        title: "Checkout principal",
        headline: "Conclua sua compra",
        url: "/checkout",
        pagina: { caminho: "/checkout", meta: {}, saidas: {} },
      },
      {
        id: "thanks",
        type: "thanks",
        x: 800,
        y: 400,
        title: "Obrigado",
        headline: "Seu pedido foi recebido",
        url: "/obrigado",
        pagina: { caminho: "/obrigado", meta: {}, saidas: {} },
      },
    ],
    edges: [
      {
        id: "landing-router",
        source: "landing",
        target: "router",
        rotulo: "Continuar",
      },
      {
        id: "fallback",
        source: "router",
        target: "checkout",
        rotulo: "Destino padrão",
      },
      {
        id: "completed",
        source: "checkout",
        target: "thanks",
        rotulo: "Pedido concluído",
      },
    ],
  };
}

function BoardExample({
  theme,
  inspector = false,
  failSave = false,
  connections = false,
}: {
  theme: EstiloMapa["tema"];
  inspector?: boolean;
  failSave?: boolean;
  connections?: boolean;
}) {
  const [cofre] = useState(() => {
    const memory = new Map<string, string>();
    return criarCofreFunil("demo-user", {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    });
  });
  return (
    <div className="flow-story-grid">
      <p>
        Quadro real com cofre em memória e API bloqueada no Storybook. Abra
        Configurações para ver o diálogo; no exemplo de falha, Salvar mostra o
        aviso real do quadro.
      </p>
      <div className="flow-story-board">
        <FunnelBoard
          key={`${theme}:${inspector}:${failSave}:${connections}`}
          storageId="demo-user"
          cofre={cofre}
          inicial={
            connections ? connectionsFunnel(theme) : exampleFunnel(theme)
          }
          focoTipo={inspector ? "redirect" : undefined}
          syncStatus={{
            state: "local",
            message: "Storybook · alterações apenas em memória",
          }}
          onRascunho={(data) => cofre.salvarRascunho(data)}
          onSalvar={(data) => {
            if (failSave)
              throw new Error(
                "Demonstração: falha ao salvar. Suas alterações permanecem no quadro.",
              );
            cofre.salvarFunil(data);
          }}
        />
      </div>
    </div>
  );
}

function connectionsFunnel(theme: EstiloMapa["tema"]): FunnelData {
  return {
    id: "storybook-connections",
    nome: "Conexões editáveis — exemplo local",
    projeto: "Storybook",
    mapa: { tema: theme },
    nodes: [
      {
        id: "ad",
        type: "ad",
        title: "Anúncio",
        url: "/anuncio",
        x: 80,
        y: 140,
      },
      {
        id: "message",
        type: "campaign",
        title: "Mensagem",
        url: "/mensagem",
        x: 520,
        y: 140,
      },
      {
        id: "thanks",
        type: "thanks",
        title: "Conclusão pendente",
        url: "/obrigado",
        x: 880,
        y: 140,
        pagina: { caminho: "/obrigado", meta: {}, saidas: {} },
      },
    ],
    edges: [
      {
        id: "ready",
        source: "ad",
        target: "message",
        rotulo: "Percurso configurado",
        estilo: {
          sourceAnchor: { side: "bottom", offset: 0.75 },
          targetAnchor: { side: "top", offset: 0.25 },
          espessura: 3,
        },
      },
      {
        id: "pending",
        source: "message",
        target: "thanks",
        rotulo: "ZIP pendente",
        estilo: { cor: "#B6A0FF", espessura: 3 },
      },
      {
        id: "off",
        source: "ad",
        target: "thanks",
        rotulo: "Fluxo desligado",
        estilo: {
          cor: "#F1A94E",
          fluxo: false,
          sourceAnchor: { side: "top", offset: 0.2 },
          targetAnchor: { side: "top", offset: 0.8 },
        },
      },
    ],
  };
}

export const ConexoesEditaveis: Story = {
  render: (_args, context) => (
    <BoardExample theme={storyTheme(context.globals.flowTheme)} connections />
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Selecione um fio para arrastar o percurso ou suas pontas por todo o contorno dos blocos. Cor, espessura e fluxo são independentes; as luzes indicam configuração e respeitam movimento reduzido. Exemplo local com API bloqueada.",
      },
    },
  },
};

function storyTheme(value: unknown): EstiloMapa["tema"] {
  return value === "papel" || value === "azul" || value === "grafite"
    ? value
    : "padrao";
}

export const QuadroReal: Story = {
  render: (_args, context) => (
    <BoardExample theme={storyTheme(context.globals.flowTheme)} />
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "FunnelBoard real: NodeView, conexões, ferramentas do canvas e lista de etapas. Editar não persiste dados da conta.",
      },
    },
  },
};

export const QuadroComInspetor: Story = {
  render: (_args, context) => (
    <BoardExample theme={storyTheme(context.globals.flowTheme)} inspector />
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Abre o RedirectPanel real. Até 1024 px, FlowInspector limita o foco à edição e devolve-o ao fechar.",
      },
    },
  },
};

export const QuadroComFalhaDeSalvamento: Story = {
  render: (_args, context) => (
    <BoardExample theme={storyTheme(context.globals.flowTheme)} failSave />
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Abra Configurações no menu do quadro e clique Salvar. O callback de demonstração lança uma falha, acionando o Toast existente sem apagar o rascunho.",
      },
    },
  },
};

function RouterExample({ fullScreen = false }: { fullScreen?: boolean }) {
  const [nodes, setNodes] = useState<FunnelNode[]>(() => exampleFunnel().nodes);
  const [open, setOpen] = useState(!fullScreen);
  const node = nodes.find((item) => item.id === "router")!;
  const patch = (change: Partial<FunnelNode>) =>
    setNodes((items) =>
      items.map((item) =>
        item.id === node.id ? { ...item, ...change } : item,
      ),
    );
  return (
    <div className="flow-story-grid">
      <p>
        Regras e testes locais do componente real. Crie, edite e reordene regras
        para conferir os estados.
      </p>
      {!open ? (
        <FlowButton onClick={() => setOpen(true)}>
          Abrir roteador de exemplo
        </FlowButton>
      ) : (
        <div className="flow-story-inspector">
          <FlowInspector
            fullScreen={fullScreen}
            label="Roteador de ofertas de exemplo"
            onClose={() => setOpen(false)}
          >
            <RedirectPanel
              node={node}
              nodes={nodes}
              defaultNodeId="checkout"
              onNome={(title) => patch({ title })}
              onAddress={(url) => patch({ url })}
              onChange={(redir) => patch({ redir })}
              onFechar={() => setOpen(false)}
            />
          </FlowInspector>
        </div>
      )}
    </div>
  );
}

export const RoteadorReal: Story = {
  render: () => <RouterExample />,
  parameters: { controls: { disable: true } },
};

export const InspetorComFocoContido: Story = {
  render: () => <RouterExample fullScreen />,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "Composição real de FlowInspector e RedirectPanel. Tab, Shift+Tab, Escape e Fechar exercitam o modal acessível usado em telas menores.",
      },
    },
  },
};

function PublisherExample() {
  const [domain, setDomain] = useState("");
  return (
    <div className="flow-story-grid flow-story-rule">
      <h2>Publicação: pacote pendente</h2>
      <p>
        Componente real, sem ZIP e sem API. Não confirma uma publicação
        fictícia.
      </p>
      <PageVpsPublisher
        zip={null}
        domain={domain}
        path="/"
        onDomainChange={setDomain}
      />
    </div>
  );
}

export const PublicacaoSemPacote: Story = {
  render: () => <PublisherExample />,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "PageVpsPublisher real. Carregar sites retorna uma indisponibilidade explícita do catálogo; o Storybook bloqueia a API.",
      },
    },
  },
};

function PublishReviewExample() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flow-story-grid">
      <h2>Revisão do site completo</h2>
      <p>
        Abre o diálogo de publicação real no estado inicial. A API fica
        bloqueada neste catálogo.
      </p>
      <FlowButton onClick={() => setOpen(true)}>
        Abrir revisão de publicação
      </FlowButton>
      {open && (
        <FunnelSitePublisher
          data={exampleFunnel()}
          storageId="demo-user"
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export const RevisaoDePublicacao: Story = {
  render: () => <PublishReviewExample />,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "FunnelSitePublisher existente: preparação/revisão do ZIP, invalidação após edição e publicação com confirmação. O exemplo não fornece arquivos nem inventa sucesso de publicação.",
      },
    },
  },
};

function ConfirmationExample({ theme }: { theme: string }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="flow-story-grid">
      <h2>Confirmação de remoção</h2>
      <p>
        Cancelar preserva o estado. Confirmar altera somente este exemplo local.
      </p>
      <FlowConfirmDialog
        title="Excluir o rascunho de exemplo?"
        description="As etapas e conexões deste exemplo seriam removidas. Essa demonstração não afeta a conta."
        confirmLabel="Excluir rascunho"
        theme={theme}
        onConfirm={() => setConfirmed(true)}
      >
        <FlowButton variant="danger">Excluir rascunho de exemplo</FlowButton>
      </FlowConfirmDialog>
      <FlowStatusBadge tone={confirmed ? "info" : "neutral"}>
        {confirmed
          ? "Confirmação recebida — somente no exemplo"
          : "Rascunho do exemplo preservado"}
      </FlowStatusBadge>
    </div>
  );
}

export const ConfirmacaoDeRemocao: Story = {
  render: (_args, context) => (
    <ConfirmationExample theme={String(context.globals.flowTheme)} />
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          "FlowConfirmDialog real, com foco contido, Escape, Cancelar e ação destrutiva explícita. O callback modifica apenas a demonstração.",
      },
    },
  },
};
