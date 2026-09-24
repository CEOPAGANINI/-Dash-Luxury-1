export type PageKind =
  | "home"
  | "landing"
  | "collection"
  | "category"
  | "product"
  | "cart"
  | "checkout"
  | "upsell"
  | "downsell"
  | "thank-you"
  | "external";

export type FlowTemplateKind = "basic" | "store" | "upsell";

export type FlowPage = {
  id: string;
  kind: PageKind;
  name: string;
  url: string;
  headline: string;
  description: string;
  buttonLabel: string;
  imageUrl: string;
  x: number;
  y: number;
};

export type FlowConnection = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type LandingFlow = {
  version: 1;
  name: string;
  pages: FlowPage[];
  connections: FlowConnection[];
};

export const FLOW_LIMITS = {
  pages: 20,
  connections: 40,
  id: 100,
  name: 120,
  headline: 240,
  description: 2000,
  buttonLabel: 80,
  url: 2048,
  label: 100,
  coordinate: 2000,
  serialized: 200_000,
} as const;

export const PAGE_KIND_LABELS: Record<PageKind, string> = {
  home: "Início da loja",
  landing: "Landing page",
  collection: "Coleção",
  category: "Categoria",
  product: "Página de produto",
  cart: "Carrinho",
  checkout: "Checkout",
  upsell: "Upsell",
  downsell: "Downsell",
  "thank-you": "Obrigado",
  external: "Página externa",
};

export const FLOW_TEMPLATE_LABELS: Record<FlowTemplateKind, string> = {
  basic: "Funil básico",
  store: "Loja completa",
  upsell: "Upsell e downsell",
};

const pageDefaults: Record<
  PageKind,
  Pick<FlowPage, "headline" | "description" | "buttonLabel">
> = {
  home: {
    headline: "Boas-vindas à sua loja — rascunho",
    description:
      "Conteúdo de exemplo. Apresente a marca, as coleções e os destaques da loja.",
    buttonLabel: "Explorar a loja",
  },
  landing: {
    headline: "Sua oferta começa aqui — rascunho",
    description:
      "Conteúdo de exemplo. Apresente a sua oferta antes de publicar.",
    buttonLabel: "Conhecer a oferta",
  },
  collection: {
    headline: "Conheça a sua coleção — rascunho",
    description:
      "Conteúdo de exemplo. Reúna produtos relacionados em uma coleção.",
    buttonLabel: "Explorar a coleção",
  },
  category: {
    headline: "Encontre o que procura — rascunho",
    description:
      "Conteúdo de exemplo. Organize os produtos desta categoria para facilitar a escolha.",
    buttonLabel: "Ver produtos",
  },
  product: {
    headline: "Seu produto em destaque — rascunho",
    description:
      "Conteúdo de exemplo. Edite a apresentação do produto, suas opções e a chamada para compra.",
    buttonLabel: "Adicionar ao carrinho",
  },
  cart: {
    headline: "Revise seu carrinho — rascunho",
    description:
      "Conteúdo de exemplo. Planeje a revisão dos itens antes de seguir para o checkout.",
    buttonLabel: "Ir para o checkout",
  },
  checkout: {
    headline: "Finalize seu pedido — rascunho",
    description: "Conteúdo de exemplo. Configure o destino real do checkout.",
    buttonLabel: "Continuar para o pagamento",
  },
  upsell: {
    headline: "Uma oferta complementar — rascunho",
    description:
      "Conteúdo de exemplo. Apresente uma oferta adicional e planeje os caminhos de aceite e recusa.",
    buttonLabel: "Quero essa oferta",
  },
  downsell: {
    headline: "Outra opção para você — rascunho",
    description:
      "Conteúdo de exemplo. Apresente uma alternativa quando a oferta anterior for recusada.",
    buttonLabel: "Conhecer a alternativa",
  },
  "thank-you": {
    headline: "Obrigado pela sua visita — rascunho",
    description:
      "Conteúdo de exemplo. Defina aqui a mensagem de agradecimento.",
    buttonLabel: "Voltar ao início",
  },
  external: {
    headline: "Seu próximo destino — rascunho",
    description: "Conteúdo de exemplo. Informe o endereço da página externa.",
    buttonLabel: "Acessar página",
  },
};

export const INITIAL_FLOW: LandingFlow = {
  version: 1,
  name: "Meu fluxo — rascunho",
  pages: [
    {
      id: "page-landing",
      kind: "landing",
      name: "Landing page",
      url: "",
      imageUrl: "",
      ...pageDefaults.landing,
      x: 60,
      y: 120,
    },
    {
      id: "page-checkout",
      kind: "checkout",
      name: "Checkout",
      url: "",
      imageUrl: "",
      ...pageDefaults.checkout,
      x: 420,
      y: 260,
    },
    {
      id: "page-thank-you",
      kind: "thank-you",
      name: "Obrigado",
      url: "",
      imageUrl: "",
      ...pageDefaults["thank-you"],
      x: 780,
      y: 120,
    },
  ],
  connections: [
    {
      id: "connection-offer",
      source: "page-landing",
      target: "page-checkout",
      label: "Ir para o checkout",
    },
    {
      id: "connection-thanks",
      source: "page-checkout",
      target: "page-thank-you",
      label: "Após a confirmação",
    },
  ],
};

const SIMULATION_DESCRIPTION =
  " Apenas simulação do fluxo: não publica páginas, processa compras nem executa redirecionamentos automaticamente.";

/** Templates are independent drafts, not published stores or executable funnels. */
export function createFlowTemplate(kind: FlowTemplateKind): LandingFlow {
  if (kind === "basic") {
    const pageIds = new Map(
      INITIAL_FLOW.pages.map((page) => [page.id, `template-basic-${page.id}`]),
    );
    return {
      version: 1,
      name: "Modelo de funil básico — simulação",
      pages: INITIAL_FLOW.pages.map((page) => ({
        ...page,
        id: pageIds.get(page.id)!,
        description: page.description + SIMULATION_DESCRIPTION,
      })),
      connections: INITIAL_FLOW.connections.map((connection) => ({
        ...connection,
        id: `template-basic-${connection.id}`,
        source: pageIds.get(connection.source)!,
        target: pageIds.get(connection.target)!,
        label: `${connection.label} (simulação)`,
      })),
    };
  }

  let positions: [PageKind, number, number][];
  let links: [PageKind, PageKind, string][];
  if (kind === "store") {
    const stages: PageKind[] = [
      "home",
      "collection",
      "category",
      "product",
      "cart",
      "checkout",
      "thank-you",
    ];
    positions = stages.map((stage, index) => [stage, 40 + index * 320, 160]);
    links = [
      ["home", "collection", "Explorar a coleção"],
      ["collection", "category", "Escolher uma categoria"],
      ["category", "product", "Ver o produto"],
      ["product", "cart", "Adicionar ao carrinho"],
      ["cart", "checkout", "Ir para o checkout"],
      ["checkout", "thank-you", "Após a confirmação"],
    ];
  } else if (kind === "upsell") {
    positions = [
      ["landing", 40, 160],
      ["product", 360, 160],
      ["checkout", 680, 160],
      ["upsell", 1000, 160],
      ["downsell", 1320, 500],
      ["thank-you", 1680, 160],
    ];
    links = [
      ["landing", "product", "Conhecer o produto"],
      ["product", "checkout", "Ir para o checkout"],
      ["checkout", "upsell", "Apresentar a oferta adicional"],
      ["upsell", "thank-you", "Aceitou a oferta"],
      ["upsell", "downsell", "Recusou a oferta"],
      ["downsell", "thank-you", "Continuar"],
    ];
  } else {
    throw new TypeError("Modelo de fluxo inválido.");
  }

  const pageId = (pageKind: PageKind) => `template-${kind}-page-${pageKind}`;
  return {
    version: 1,
    name: `Modelo ${kind === "store" ? "de loja completa" : "de upsell e downsell"} — simulação`,
    pages: positions.map(([pageKind, x, y]) => ({
      id: pageId(pageKind),
      kind: pageKind,
      name: PAGE_KIND_LABELS[pageKind],
      url: "",
      imageUrl: "",
      ...pageDefaults[pageKind],
      description: pageDefaults[pageKind].description + SIMULATION_DESCRIPTION,
      x,
      y,
    })),
    connections: links.map(([source, target, label]) => ({
      id: `template-${kind}-connection-${source}-${target}`,
      source: pageId(source),
      target: pageId(target),
      label: `${label} (simulação)`,
    })),
  };
}

function isPageKind(value: unknown): value is PageKind {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PAGE_KIND_LABELS, value)
  );
}

function randomId(prefix: string): string {
  // Never fall back to Math.random for persisted identifiers.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createFlowPage(kind: PageKind, index: number): FlowPage {
  if (!isPageKind(kind)) throw new TypeError("Tipo de página inválido.");
  const position = Number.isFinite(index)
    ? Math.min(FLOW_LIMITS.pages - 1, Math.max(0, Math.floor(index)))
    : 0;
  return {
    id: randomId("page"),
    kind,
    name: `${PAGE_KIND_LABELS[kind]} ${position + 1}`,
    url: "",
    imageUrl: "",
    ...pageDefaults[kind],
    x: 60 + (position % 3) * 360,
    y: Math.min(FLOW_LIMITS.coordinate, 120 + Math.floor(position / 3) * 260),
  };
}

const unsafeUrlCharacters = /[\\\u0000-\u0020\u007f-\u009f]/;
const decodedUnsafeCharacters = /[\\\u0000-\u001f\u007f-\u009f]/;

/** Browser navigation only: never scripts, data URLs, credentials or // hosts. */
export function validateDestinationUrl(value: string): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > FLOW_LIMITS.url ||
    unsafeUrlCharacters.test(value)
  ) {
    return false;
  }
  try {
    if (decodedUnsafeCharacters.test(decodeURIComponent(value))) return false;
  } catch {
    return false;
  }
  if (value.startsWith("/")) {
    // Encoded leading separators must not become a protocol-relative URL
    // after a router or reverse proxy decodes the path.
    if (value.startsWith("//") || /^\/%(?:2f|5c)/i.test(value)) return false;
    try {
      const base = "https://orbit.internal";
      return new URL(value, base).origin === base;
    } catch {
      return false;
    }
  }
  if (!/^https?:\/\//i.test(value)) return false;
  if (/^https?:\/\/[^/?#]*@/i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  max: number,
  required = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    (!required || value.trim().length > 0)
  );
}

function validId(value: unknown): value is string {
  return (
    boundedString(value, FLOW_LIMITS.id, true) &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)
  );
}

function draftUrl(value: unknown): value is string {
  return (
    value === "" || (typeof value === "string" && validateDestinationUrl(value))
  );
}

function coordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(FLOW_LIMITS.coordinate, Math.max(0, value))
    : null;
}

function createsCycle(
  connections: readonly FlowConnection[],
  source: string,
  target: string,
): boolean {
  const pending = [target];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const connection of connections) {
      if (connection.source === current) pending.push(connection.target);
    }
  }
  return false;
}

/** Accepts a JSON value or JSON text; always returns a new, bounded object. */
export function parseFlow(raw: unknown): LandingFlow | null {
  if (typeof raw === "string") {
    if (raw.length > FLOW_LIMITS.serialized) return null;
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (
    !record(raw) ||
    raw.version !== 1 ||
    !boundedString(raw.name, FLOW_LIMITS.name, true) ||
    !Array.isArray(raw.pages) ||
    raw.pages.length > FLOW_LIMITS.pages ||
    !Array.isArray(raw.connections) ||
    raw.connections.length > FLOW_LIMITS.connections
  ) {
    return null;
  }

  const pages: FlowPage[] = [];
  const pageIds = new Set<string>();
  for (const item of raw.pages) {
    if (
      !record(item) ||
      !validId(item.id) ||
      pageIds.has(item.id) ||
      !isPageKind(item.kind) ||
      !boundedString(item.name, FLOW_LIMITS.name, true) ||
      !boundedString(item.headline, FLOW_LIMITS.headline) ||
      !boundedString(item.description, FLOW_LIMITS.description) ||
      !boundedString(item.buttonLabel, FLOW_LIMITS.buttonLabel) ||
      !draftUrl(item.url) ||
      !draftUrl(item.imageUrl)
    ) {
      return null;
    }
    const x = coordinate(item.x);
    const y = coordinate(item.y);
    if (x === null || y === null) return null;
    pageIds.add(item.id);
    pages.push({
      id: item.id,
      kind: item.kind,
      name: item.name,
      url: item.url,
      headline: item.headline,
      description: item.description,
      buttonLabel: item.buttonLabel,
      imageUrl: item.imageUrl,
      x,
      y,
    });
  }

  const connections: FlowConnection[] = [];
  const connectionIds = new Set<string>();
  for (const item of raw.connections) {
    if (
      !record(item) ||
      !validId(item.id) ||
      connectionIds.has(item.id) ||
      pageIds.has(item.id) ||
      !validId(item.source) ||
      !validId(item.target) ||
      !pageIds.has(item.source) ||
      !pageIds.has(item.target) ||
      item.source === item.target ||
      !boundedString(item.label, FLOW_LIMITS.label) ||
      connections.some(
        (edge) => edge.source === item.source && edge.target === item.target,
      ) ||
      createsCycle(connections, item.source, item.target)
    ) {
      return null;
    }
    connectionIds.add(item.id);
    connections.push({
      id: item.id,
      source: item.source,
      target: item.target,
      label: item.label,
    });
  }
  return { version: 1, name: raw.name, pages, connections };
}

export function connectPages(
  flow: LandingFlow,
  source: string,
  target: string,
  label: string,
): { flow: LandingFlow; error?: string } {
  if (!parseFlow(flow))
    return { flow, error: "O fluxo contém dados inválidos." };
  if (
    !flow.pages.some((page) => page.id === source) ||
    !flow.pages.some((page) => page.id === target)
  ) {
    return { flow, error: "Escolha duas páginas existentes." };
  }
  if (source === target)
    return { flow, error: "Uma página não pode se conectar a ela mesma." };
  if (
    flow.connections.some(
      (edge) => edge.source === source && edge.target === target,
    )
  ) {
    return { flow, error: "Essas páginas já estão conectadas nessa direção." };
  }
  if (createsCycle(flow.connections, source, target)) {
    return { flow, error: "Essa conexão criaria um ciclo no fluxo." };
  }
  if (flow.connections.length >= FLOW_LIMITS.connections) {
    return {
      flow,
      error: `O fluxo permite até ${FLOW_LIMITS.connections} conexões.`,
    };
  }
  if (!boundedString(label, FLOW_LIMITS.label)) {
    return {
      flow,
      error: `Use até ${FLOW_LIMITS.label} caracteres no nome da conexão.`,
    };
  }
  return {
    flow: {
      ...flow,
      connections: [
        ...flow.connections,
        { id: randomId("connection"), source, target, label },
      ],
    },
  };
}

export function removeFlowPage(flow: LandingFlow, id: string): LandingFlow {
  return {
    ...flow,
    pages: flow.pages.filter((page) => page.id !== id),
    connections: flow.connections.filter(
      (edge) => edge.source !== id && edge.target !== id,
    ),
  };
}
