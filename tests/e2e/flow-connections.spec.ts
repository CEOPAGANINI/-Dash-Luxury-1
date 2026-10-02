import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const storageKey = "dash:funil:v1:demo-user";
const screenshots =
  process.env.FLOW_SCREENSHOTS_DIR ??
  path.resolve(process.cwd(), "work/screenshots");
const seed = {
  id: "connection-check",
  nome: "Conexões — teste local",
  projeto: "Demonstração",
  mapa: { fluxo: true, tema: "padrao" },
  nodes: [
    {
      id: "source",
      type: "redirect",
      title: "Entrada",
      x: 40,
      y: 80,
      url: "/entrada",
      redir: { regras: [] },
    },
    {
      id: "target",
      type: "redirect",
      title: "Destino",
      x: 480,
      y: 160,
      url: "/destino",
      redir: { regras: [] },
    },
    {
      id: "finish",
      type: "thanks",
      title: "Conclusão",
      x: 900,
      y: 380,
      url: "/conclusao",
      headline: "Pedido recebido",
    },
  ],
  edges: [
    { id: "editable", source: "source", target: "target" },
    { id: "pending", source: "target", target: "finish" },
  ],
};

type Point = { x: number; y: number };
type SavedStyle = {
  sourceAnchor?: { side: string; offset: number };
  targetAnchor?: { side: string; offset: number };
  pontos?: Point[];
  cor?: string;
  espessura?: number;
  fluxo?: boolean;
};
const edgeGroup = (page: Page, id = "editable") =>
  page.locator(`.funnel__edges > g[data-edge-id="${id}"]`);
const card = (page: Page, id: string) =>
  page.locator(`.funnel__node[data-in="${id}"]`);
const tools = (page: Page) =>
  page.getByRole("region", { name: "Editar conexão", exact: true });

async function openFixture(page: Page) {
  await page.addInitScript(
    ({ key, graph }) => {
      if (!window.localStorage.getItem(key))
        window.localStorage.setItem(
          key,
          JSON.stringify({
            versao: 1,
            revisao: "e2e-local",
            rascunho: graph,
            funis: [],
            redirecionadores: [],
          }),
        );
    },
    { key: storageKey, graph: seed },
  );
  await page.goto("/roteador-de-ofertas");
  await expect(page.locator('[data-demo-mode="true"]')).toBeVisible();
  await expect(card(page, "source")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nome do redirecionador", exact: true }),
  ).toHaveValue("Entrada");
}

async function closeAndFit(page: Page) {
  await page
    .getByRole("button", { name: "Fechar redirecionador", exact: true })
    .click();
  await page.getByRole("button", { name: "Enquadrar", exact: true }).click();
}

async function exposedWirePoint(locator: Locator): Promise<Point> {
  return locator.evaluate((element) => {
    const path = element as SVGPathElement;
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error("Conexão sem coordenadas de tela");
    for (const fraction of [
      0.35, 0.4, 0.6, 0.65, 0.75, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9, 0.05, 0.95,
    ]) {
      const point = path.getPointAtLength(path.getTotalLength() * fraction);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      if (document.elementFromPoint(screen.x, screen.y) === element)
        return { x: screen.x, y: screen.y };
    }
    throw new Error("Nenhum trecho do fio está exposto para arrastar");
  });
}

async function selectEdge(page: Page, id = "editable") {
  const point = await exposedWirePoint(
    edgeGroup(page, id).locator(".funnel__edge-hit"),
  );
  await page.mouse.click(point.x, point.y);
  await expect(tools(page)).toBeVisible();
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function circleCenter(locator: Locator): Promise<Point> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error("Ponta não encontrada");
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function savedStyle(page: Page, id = "editable"): Promise<SavedStyle> {
  return page.evaluate(
    ({ key, edgeId }) => {
      const envelope = JSON.parse(window.localStorage.getItem(key) ?? "null");
      return (
        envelope?.rascunho?.edges.find(
          (edge: { id: string }) => edge.id === edgeId,
        )?.estilo ?? {}
      );
    },
    { key: storageKey, edgeId: id },
  );
}

async function customColor(page: Page, color: string) {
  // Native color pickers belong to the OS. Dispatch the value change through
  // the native setter so React receives the same input event as that picker.
  await tools(page)
    .getByLabel("Cor da linha", { exact: true })
    .evaluate((element, value) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, color);
}

async function capture(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, name),
    fullPage: true,
    animations: "disabled",
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin)
      await route.abort("blockedbyclient");
    else await route.continue();
  });
});

test("abre cada etapa inteira à esquerda do inspetor que ocupa metade do quadro", async ({
  page,
}) => {
  await openFixture(page);
  const editor = page.locator('.funnel[data-design-system="flow"]');
  const inspector = page.locator(".pub");
  for (const [id, title] of [
    ["source", "Entrada"],
    ["target", "Destino"],
    ["finish", "Conclusão"],
  ]) {
    if (id !== "source") {
      await page.locator(".pub__x").click();
      await page
        .getByRole("button", { name: "Enquadrar", exact: true })
        .click();
      await card(page, id)
        .getByRole("button", { name: `Configurar ${title}`, exact: true })
        .click();
    }
    await expect(inspector).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = (await editor.boundingBox())!;
        const panel = (await inspector.boundingBox())!;
        const node = (await card(page, id).boundingBox())!;
        return Math.max(
          Math.abs(panel.width - bounds.width / 2),
          Math.abs(panel.x - bounds.x - bounds.width / 2),
          bounds.x - node.x,
          bounds.y - node.y,
          node.x + node.width - panel.x,
          node.y + node.height - bounds.y - bounds.height,
        );
      })
      .toBeLessThanOrEqual(2);
  }
  await capture(page, "flow-editor-metade-esquerda.png");
});

test("arrasta pontas fora do centro, curva e estilo e recupera tudo após reload", async ({
  page,
}) => {
  await openFixture(page);
  await closeAndFit(page);
  await selectEdge(page);
  const toolbar = tools(page);
  expect(
    await toolbar.evaluate((element) => getComputedStyle(element).borderRadius),
  ).not.toBe("0px");
  const source = (await card(page, "source").boundingBox())!;
  await drag(
    page,
    await circleCenter(
      page.locator(
        '.funnel__edge-endpoint[data-edge-id="editable"][data-endpoint="source"]',
      ),
    ),
    { x: source.x + source.width * 0.23, y: source.y },
  );
  await expect
    .poll(async () => (await savedStyle(page)).sourceAnchor?.side)
    .toBe("top");
  expect((await savedStyle(page)).sourceAnchor!.offset).toBeCloseTo(0.23, 1);
  const target = (await card(page, "target").boundingBox())!;
  await drag(
    page,
    await circleCenter(
      page.locator(
        '.funnel__edge-endpoint[data-edge-id="editable"][data-endpoint="target"]',
      ),
    ),
    { x: target.x + target.width * 0.72, y: target.y + target.height },
  );
  await expect
    .poll(async () => (await savedStyle(page)).targetAnchor?.side)
    .toBe("bottom");
  expect((await savedStyle(page)).targetAnchor!.offset).toBeCloseTo(0.72, 1);
  const hit = edgeGroup(page).locator(".funnel__edge-hit");
  const before = await hit.getAttribute("d");
  const middle = await exposedWirePoint(hit);
  await drag(page, middle, { x: middle.x - 55, y: middle.y - 75 });
  await expect(hit).not.toHaveAttribute("d", before!);
  await expect
    .poll(async () => (await savedStyle(page)).pontos?.length ?? 0)
    .toBeGreaterThan(0);
  await customColor(page, "#d946ef");
  await toolbar
    .getByRole("button", { name: "Espessura grossa", exact: true })
    .click();
  await expect
    .poll(() => savedStyle(page))
    .toMatchObject({ cor: "#d946ef", espessura: 3 });
  const stored = await savedStyle(page);
  await capture(page, "flow-editor-conexao-personalizada.png");
  await page.reload();
  await expect(card(page, "source")).toBeVisible();
  await expect.poll(() => savedStyle(page)).toEqual(stored);
  await closeAndFit(page);
  await selectEdge(page);
  await expect(toolbar.getByLabel("Cor da linha", { exact: true })).toHaveValue(
    "#d946ef",
  );
  await expect(
    toolbar.getByRole("button", { name: "Espessura grossa", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.funnel__edge-endpoint[data-edge-id="editable"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('.funnel__edge-bend[data-edge-id="editable"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(".funnel__controls-world .funnel__ponto"),
  ).toHaveCount(stored.pontos!.length);
});

test("arrastar em dois níveis de zoom preserva offsets normalizados na borda", async ({
  page,
}) => {
  await openFixture(page);
  await closeAndFit(page);
  for (const offset of [0.28, 0.78]) {
    if (offset === 0.78)
      await page.getByRole("button", { name: "Afastar", exact: true }).click();
    await selectEdge(page);
    const target = (await card(page, "target").boundingBox())!;
    const expected = {
      x: target.x + target.width,
      y: target.y + target.height * offset,
    };
    const from = await circleCenter(
      page.locator(
        '.funnel__edge-endpoint[data-edge-id="editable"][data-endpoint="target"]',
      ),
    );
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(expected.x, expected.y, { steps: 12 });
    // SVG handles must remain under the pointer while pressed. Generic button
    // active scaling otherwise moves their coordinates far from the card.
    await expect
      .poll(async () => {
        const point = await circleCenter(
          page.locator(
            '.funnel__edge-endpoint[data-edge-id="editable"][data-endpoint="target"]',
          ),
        );
        return Math.hypot(point.x - expected.x, point.y - expected.y);
      })
      .toBeLessThan(4);
    await page.mouse.up();
    await expect
      .poll(async () => (await savedStyle(page)).targetAnchor?.side)
      .toBe("right");
    await expect
      .poll(async () =>
        Math.abs((await savedStyle(page)).targetAnchor!.offset - offset),
      )
      .toBeLessThan(0.03);
    const actual = await circleCenter(
      page.locator(
        '.funnel__edge-endpoint[data-edge-id="editable"][data-endpoint="target"]',
      ),
    );
    expect(
      Math.hypot(actual.x - expected.x, actual.y - expected.y),
    ).toBeLessThan(4);
  }
});

test("cria uma conexão por pontos fora do centro nas bordas inferior e esquerda", async ({
  page,
}) => {
  await openFixture(page);
  await closeAndFit(page);
  const source = (await card(page, "source").boundingBox())!;
  const target = (await card(page, "finish").boundingBox())!;
  const from = {
    x: source.x + source.width * 0.34,
    y: source.y + source.height - 1,
  };
  const to = { x: target.x + 1, y: target.y + target.height * 0.66 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect(
    page.locator('.funnel[data-design-system="flow"]'),
  ).toHaveAttribute("data-connecting", "true");
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  const newStyle = () =>
    page.evaluate((key) => {
      const envelope = JSON.parse(window.localStorage.getItem(key) ?? "null");
      return envelope?.rascunho?.edges.find(
        (edge: { source: string; target: string }) =>
          edge.source === "source" && edge.target === "finish",
      )?.estilo as SavedStyle | undefined;
    }, storageKey);
  await expect.poll(newStyle).toMatchObject({
    sourceAnchor: { side: "bottom" },
    targetAnchor: { side: "left" },
  });
  const style = (await newStyle())!;
  expect(style.sourceAnchor!.offset).toBeCloseTo(0.34, 1);
  expect(style.targetAnchor!.offset).toBeCloseTo(0.66, 1);
  await expect(page.locator(".funnel__edge--temp")).toHaveCount(0);
});

test("fluxo pode ser desligado na linha e globalmente sem trocar cor personalizada", async ({
  page,
}) => {
  await openFixture(page);
  await closeAndFit(page);
  await selectEdge(page);
  await customColor(page, "#d946ef");
  const line = edgeGroup(page).locator(".funnel__edge");
  const signal = edgeGroup(page).locator(".funnel__edge-signal");
  await expect(signal).toHaveAttribute("data-ready", "true");
  await expect(signal.locator(".funnel__edge-pulse")).toHaveCount(1);
  await tools(page)
    .getByRole("checkbox", { name: "Animar fluxo desta linha", exact: true })
    .uncheck();
  await expect(signal).toHaveAttribute("data-enabled", "false");
  await expect(signal.locator("circle")).toHaveCount(0);
  await expect
    .poll(() => line.evaluate((element) => getComputedStyle(element).stroke))
    .toBe("rgb(217, 70, 239)");
  await tools(page)
    .getByRole("checkbox", { name: "Animar fluxo desta linha", exact: true })
    .check();
  await tools(page)
    .getByRole("button", { name: "Desligar fluxo geral", exact: true })
    .click();
  await expect(signal).toHaveAttribute("data-enabled", "false");
  await expect(signal.locator("circle")).toHaveCount(0);
  await expect
    .poll(() => line.evaluate((element) => getComputedStyle(element).stroke))
    .toBe("rgb(217, 70, 239)");
  await tools(page)
    .getByRole("button", { name: "Ligar fluxo geral", exact: true })
    .click();
  await expect(signal.locator(".funnel__edge-pulse")).toHaveCount(1);
  await expect.poll(async () => (await savedStyle(page)).cor).toBe("#d946ef");
  const toolbar = tools(page);
  const toolbarBounds = (await toolbar.boundingBox())!;
  const editorBounds = (await page
    .locator('.funnel[data-design-system="flow"]')
    .boundingBox())!;
  expect(toolbarBounds.y + toolbarBounds.height).toBeLessThanOrEqual(
    editorBounds.y + editorBounds.height - 8,
  );
  const zoom = await page
    .getByLabel("Zoom do quadro", { exact: true })
    .innerText();
  await page.mouse.move(
    toolbarBounds.x + toolbarBounds.width - 12,
    toolbarBounds.y + toolbarBounds.height / 2,
  );
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => toolbar.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.getByLabel("Zoom do quadro", { exact: true })).toHaveText(
    zoom,
  );
  await expect(
    toolbar.getByRole("button", { name: "Apagar linha", exact: true }),
  ).toBeInViewport({ ratio: 0.9999 });
});

test("movimento reduzido mantém estado verde/vermelho e remove pulsos em movimento", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page);
  await closeAndFit(page);
  const ready = edgeGroup(page).locator(".funnel__edge-signal");
  const pending = edgeGroup(page, "pending").locator(".funnel__edge-signal");
  await expect(ready).toHaveAttribute("data-ready", "true");
  await expect(pending).toHaveAttribute("data-ready", "false");
  await expect(page.locator(".funnel__edge-pulse animateMotion")).toHaveCount(
    0,
  );
  await expect(ready.locator(".funnel__edge-signal-tip")).toHaveCount(1);
  await expect(pending.locator(".funnel__edge-signal-tip")).toHaveCount(1);
  expect(
    await ready
      .locator(".funnel__edge-signal-tip .funnel__edge-light")
      .evaluate((element) => getComputedStyle(element).fill),
  ).toBe("rgb(74, 222, 128)");
  expect(
    await pending
      .locator(".funnel__edge-signal-tip .funnel__edge-light")
      .evaluate((element) => getComputedStyle(element).fill),
  ).toBe("rgb(248, 113, 113)");
});
