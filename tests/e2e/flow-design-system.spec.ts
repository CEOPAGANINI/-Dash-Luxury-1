import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const screenshots = process.env.FLOW_SCREENSHOTS_DIR
  ? path.resolve(process.env.FLOW_SCREENSHOTS_DIR)
  : path.resolve(__dirname, "../../work/screenshots");

async function openRouter(page: Page) {
  await page.goto("/roteador-de-ofertas");
  // Never edit a real account: this suite exercises the explicit demo session.
  await expect(page.locator('[data-demo-mode="true"]')).toBeVisible();
  await expect(page).toHaveTitle(/Roteador de ofertas/);
  await expect(
    page.getByRole("complementary", { name: "Redirecionador" }),
  ).toBeVisible();
}

async function capture(page: Page, filename: string) {
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, filename),
    fullPage: true,
    animations: "disabled",
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", async (route) => {
    const requestURL = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(requestURL.protocol) &&
      requestURL.origin !== origin
    ) {
      // Browsers in these tests cannot contact production APIs or services.
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
});

test("abre o quadro demo e navega no inspetor por teclado sem iniciar uma conexão", async ({
  page,
}) => {
  await openRouter(page);
  const inspector = page.getByRole("complementary", { name: "Redirecionador" });
  const regras = inspector.getByRole("tab", { name: "Regras", exact: true });
  await expect(regras).toBeFocused();
  await regras.press("ArrowDown");
  const testar = inspector.getByRole("tab", { name: "Testar", exact: true });
  await expect(testar).toBeFocused();
  await expect(testar).toHaveAttribute("aria-selected", "true");
  await expect(
    inspector.getByRole("tabpanel", { name: "Testar" }),
  ).toBeVisible();
  await expect(
    inspector.getByText("Simulação — não são dados reais"),
  ).toBeVisible();
  await testar.press("Home");
  await expect(regras).toBeFocused();
  await expect(page.locator(".funnel__edge--temp")).toHaveCount(0);
  await expect(
    page.getByRole("menu", { name: "O que ligar aqui" }),
  ).toHaveCount(0);
  await capture(page, "roteador-desktop.png");

  const name = inspector.getByRole("textbox", {
    name: "Nome do redirecionador",
  });
  await name.focus();
  await name.press("Delete");
  await expect(inspector).toBeVisible();
  await expect(
    inspector.getByRole("textbox", { name: "Nome do redirecionador" }),
  ).toHaveValue("Redirecionador");
  await name.press("Escape");
  await expect(inspector).toHaveCount(0);
  await page
    .getByRole("group", { name: "Visualização do funil" })
    .getByRole("button", { name: "Etapas", exact: true })
    .click();
  const steps = page.getByRole("region", { name: "Etapas do funil" });
  const captureStep = steps.getByRole("button", {
    name: "Configurar Captura",
    exact: true,
  });
  await captureStep.focus();
  await captureStep.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Nome interno da página" }),
  ).toHaveValue("Captura");
  await expect(page.locator(".funnel__edge--temp")).toHaveCount(0);
});

test("reordenar a prioridade pelo teclado muda a primeira correspondência e sobrevive ao recarregamento", async ({
  page,
}) => {
  await openRouter(page);
  const inspector = page.getByRole("complementary", { name: "Redirecionador" });
  await inspector.getByRole("tab", { name: "Testar", exact: true }).click();
  await inspector
    .getByRole("combobox", { name: "Região", exact: true })
    .selectOption("RU");
  const result = inspector.locator(".rdp__veredito");
  await expect(result).toContainText("→ Indisponível");
  await expect(result).toContainText("Prioridade 1:");
  await expect(result).toContainText("Foi a primeira regra correspondente");
  await inspector.getByRole("tab", { name: "Regras", exact: true }).click();
  const lower = inspector.getByRole("button", {
    name: "Descer regra 1",
    exact: true,
  });
  await lower.focus();
  await lower.press("Enter");
  await expect(
    inspector.getByRole("region", { name: "Regra 2", exact: true }),
  ).toBeFocused();
  await expect(
    inspector.getByRole("region", { name: "Regra 1", exact: true }),
  ).toContainText("50% do tráfego");
  await inspector.getByRole("tab", { name: "Testar", exact: true }).click();
  await expect(result).toContainText("→ Oferta");
  await expect(result).toContainText("Prioridade 1: 50% do tráfego");
  await result.scrollIntoViewIfNeeded();
  await capture(page, "roteador-simulacao.png");
  await page.reload();
  await expect(inspector).toBeVisible();
  await expect(
    inspector
      .getByRole("region", { name: "Regra 1", exact: true })
      .getByRole("radio", { name: "Por fatia %", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});

test("informa o destino padrão e os limites do ZIP em vez de apresentar dados de exemplo como reais", async ({
  page,
}) => {
  await openRouter(page);
  const inspector = page.getByRole("complementary", { name: "Redirecionador" });
  await expect(inspector.locator(".rdp__default")).toContainText("Boas-vindas");
  await expect(
    inspector.getByRole("region", { name: "Regra 1", exact: true }),
  ).toContainText("Esta regra bloqueia a exportação do ZIP único");
  await inspector.getByRole("tab", { name: "Testar", exact: true }).click();
  const bucket = inspector.getByRole("slider", { name: "Roleta do tráfego" });
  await bucket.focus();
  await bucket.press("End");
  const result = inspector.locator(".rdp__veredito");
  await expect(result).toContainText("Destino padrão");
  await expect(result).toContainText("→ Boas-vindas");
  await expect(result).toContainText(
    "Nenhuma regra ativa com destino definido correspondeu",
  );
  await inspector
    .getByRole("tab", { name: "De onde vêm", exact: true })
    .click();
  await expect(
    inspector.getByText("Demonstração — não são dados reais"),
  ).toBeVisible();
  await inspector.getByRole("tab", { name: "Registro", exact: true }).click();
  await expect(
    inspector.getByText("Demonstração — não são dados reais"),
  ).toBeVisible();
  await expect(
    inspector.getByRole("table", {
      name: "Registro de redirecionamentos de demonstração",
    }),
  ).toBeVisible();
});

test("zoom reduzido apresenta cards compactos sem perder o acesso à configuração", async ({
  page,
}) => {
  await openRouter(page);
  await page
    .getByRole("button", { name: "Fechar redirecionador", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Visualização do funil" })
    .getByRole("button", { name: "Quadro", exact: true })
    .click();
  const zoom = page.getByRole("group", { name: "Controles do quadro" });
  for (let i = 0; i < 8; i++)
    await zoom.getByRole("button", { name: "Afastar", exact: true }).click();
  await expect
    .poll(async () =>
      Number.parseFloat(await page.getByLabel("Zoom do quadro").innerText()),
    )
    .toBeLessThan(60);
  await expect(
    page.locator('.funnel__node[data-compact="true"]').first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Configurar Captura", exact: true }),
  ).toBeVisible();
});

for (const width of [1024, 375]) {
  test.describe(`Tela com toque de ${width}px`, () => {
    test.use({
      viewport: { width, height: 900 },
      hasTouch: true,
      isMobile: width === 375,
    });
    test(`em ${width}px a lista permite editar etapas e o inspetor ocupa a tela com foco contido`, async ({
      page,
    }) => {
      await openRouter(page);
      const inspector = page.getByRole("complementary", {
        name: "Redirecionador",
      });
      const editor = page.locator('.funnel[data-design-system="flow"]');
      const panelBounds = await inspector.boundingBox();
      expect(panelBounds).not.toBeNull();
      expect(Math.abs(panelBounds!.width - width)).toBeLessThanOrEqual(2);
      expect(Math.abs(panelBounds!.height - 900)).toBeLessThanOrEqual(2);
      const dialog = page.getByRole("dialog", {
        name: "Configurar Redirecionador",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      const closeBounds = await inspector
        .getByRole("button", { name: "Fechar redirecionador", exact: true })
        .boundingBox();
      expect(closeBounds!.width).toBeGreaterThanOrEqual(44);
      expect(closeBounds!.height).toBeGreaterThanOrEqual(44);
      const review = inspector.getByRole("button", {
        name: "Revisar publicação",
        exact: true,
      });
      const routerName = inspector.getByRole("textbox", {
        name: "Nome do redirecionador",
      });
      await review.focus();
      await review.press("Tab");
      await expect(routerName).toBeFocused();
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await routerName.focus();
      await routerName.press("Shift+Tab");
      await expect(review).toBeFocused();
      const content = inspector.locator(".pub__corpo");
      await expect
        .poll(() =>
          content.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
      if (width === 375) await capture(page, "roteador-mobile-inspetor.png");
      await inspector
        .getByRole("button", { name: "Fechar redirecionador", exact: true })
        .click();
      await expect(editor).toHaveAttribute("data-mode", "lista");
      const steps = page.getByRole("region", { name: "Etapas do funil" });
      await expect(steps).toBeVisible();
      await expect(steps.getByRole("article")).toHaveCount(10);
      if (width === 375) await capture(page, "roteador-mobile.png");
      await steps
        .getByRole("button", { name: "Configurar Redirecionador", exact: true })
        .click();
      const regras = inspector.getByRole("tab", {
        name: "Regras",
        exact: true,
      });
      await regras.focus();
      await regras.press("ArrowRight");
      await expect(
        inspector.getByRole("tab", { name: "Testar", exact: true }),
      ).toBeFocused();
      await expect(inspector.locator(".rdp__veredito")).toContainText(
        "→ Oferta",
      );
      await expect(page.locator(".funnel__edge--temp")).toHaveCount(0);
      await inspector
        .getByRole("button", { name: "Fechar redirecionador", exact: true })
        .click();
      await expect(
        steps.getByRole("button", {
          name: "Configurar Redirecionador",
          exact: true,
        }),
      ).toBeFocused();
      await steps
        .getByRole("button", { name: "Configurar Redirecionador", exact: true })
        .click();
      await inspector
        .getByRole("button", { name: "Ver destino no quadro ↗", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(inspector).toHaveCount(0);
      const destination = steps.getByRole("article", {
        name: "E-mail Boas-vindas",
        exact: true,
      });
      await expect(destination).toHaveAttribute("data-selected", "true");
      const configureDestination = destination.getByRole("button", {
        name: "Configurar Boas-vindas",
        exact: true,
      });
      await expect(configureDestination).toBeFocused();
      await expect(configureDestination).toBeInViewport({ ratio: 1 });
    });
  });
}

test.describe("Quadro em celular", () => {
  test.use({
    viewport: { width: 375, height: 900 },
    hasTouch: true,
    isMobile: true,
  });

  test("visitar o destino no canvas fecha o inspetor e enquadra e foca a etapa correta", async ({
    page,
  }) => {
    await openRouter(page);
    const inspector = page.getByRole("complementary", {
      name: "Redirecionador",
    });
    await inspector
      .getByRole("button", { name: "Fechar redirecionador", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Visualização do funil" })
      .getByRole("button", { name: "Quadro", exact: true })
      .click();
    await expect(
      page.locator('.funnel[data-design-system="flow"]'),
    ).toHaveAttribute("data-mode", "canvas");
    await page.getByRole("button", { name: "Enquadrar", exact: true }).click();
    const canvas = page.getByRole("region", {
      name: "Quadro do funil",
      exact: true,
    });
    await canvas
      .getByRole("button", { name: "Configurar Redirecionador", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: "Configurar Redirecionador",
        exact: true,
      }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: "Ver destino no quadro ↗", exact: true })
      .click();
    await expect(inspector).toHaveCount(0);
    await expect(
      page.getByRole("dialog", {
        name: "Configurar Redirecionador",
        exact: true,
      }),
    ).toHaveCount(0);
    const destination = canvas.getByRole("button", {
      name: "Configurar Boas-vindas",
      exact: true,
    });
    await expect(destination).toBeFocused();
    // Fractional SVG/canvas transforms can report 0.99999976 even when every
    // edge is visible. Also check coordinates so tolerance stays below 1px.
    await expect(destination).toBeInViewport({ ratio: 0.9999 });
    const destinationBounds = (await destination.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(destinationBounds.x).toBeGreaterThanOrEqual(-1);
    expect(destinationBounds.y).toBeGreaterThanOrEqual(-1);
    expect(destinationBounds.x + destinationBounds.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    expect(destinationBounds.y + destinationBounds.height).toBeLessThanOrEqual(
      viewport.height + 1,
    );
    await expect
      .poll(() =>
        destination.evaluate((button) =>
          button.closest(".funnel__node")?.getAttribute("data-selected"),
        ),
      )
      .toBe("true");
    await expect(page.locator(".funnel__edge--temp")).toHaveCount(0);
  });
});
