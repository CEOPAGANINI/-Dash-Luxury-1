import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ServidorBoasVindas,
  ServidorPreparacao,
  ServidorRecursos,
  ServidorResumo,
} from "@/features/vps/servidor-boas-vindas";
import { ServidorNavigation } from "@/features/vps/servidor-navigation";
import type { EstadoDaTela } from "@/features/vps/vps-cliente";
import type { ServidorDTO } from "@/features/vps/modelo";
import styles from "@/features/vps/servidor-nexus.module.css";

const rota = vi.hoisted(() => ({ atual: "/servidor" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.atual }));
afterEach(cleanup);
const vazio: EstadoDaTela = {
  agora: "2026-09-24T17:00:00Z",
  servidores: [],
  sites: [],
  checkouts: [],
  origens: [],
  appUrl: "https://painel.test",
  comandoDesinstalar: { manterSites: "", removerSites: "" },
  podeAlterar: true,
  pendencias: [],
};

describe("CommandLayer: servidor sem tela vazia", () => {
  it("preserva a moldura e o display interno sem impor outro tema", () => {
    const { container } = render(<ServidorBoasVindas />);
    const welcome = screen.getByRole("region", {
      name: "Sua infraestrutura. Sob seu controle.",
    });
    expect(
      welcome.firstElementChild?.classList.contains(styles.welcomeInner),
    ).toBe(true);
    expect(container.querySelector(`.${styles.connectionMap}`)).toBeTruthy();
    expect(container.querySelector("[data-tema]")).toBeNull();
    expect(
      container.querySelector('[data-icon="solar:server-square-linear"]'),
    ).toBeTruthy();
  });
  it("oferece conexão e explica o fluxo sem inventar servidor ou métricas", () => {
    const { container } = render(<ServidorBoasVindas />);
    expect(
      screen
        .getByRole("link", { name: "Adicionar servidor" })
        .getAttribute("href"),
    ).toBe("/servidor/novo");
    expect(screen.getByText(/Nenhum servidor conectado ainda/)).toBeTruthy();
    expect(screen.getByText("Sua VPS")).toBeTruthy();
    expect(screen.getByText(/Sua senha da VPS não fica/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+%|\d+\.\d+\.\d+\.\d+/);
  });
  it("mostra contagens reais zeradas, não telemetria simulada", () => {
    const { container } = render(<ServidorResumo estado={vazio} />);
    expect(
      [...container.querySelectorAll("dd")].map(
        (el) => el.firstChild?.textContent,
      ),
    ).toEqual(["0", "0", "0"]);
  });
  it("online exige servidor ativo e sinal online", () => {
    const servidores = [
      { estado: "ativo", sinal: { tipo: "online" } },
      { estado: "ativo", sinal: { tipo: "offline" } },
      { estado: "aguardando_confirmacao", sinal: { tipo: "online" } },
    ] as ServidorDTO[];
    const { container } = render(
      <ServidorResumo estado={{ ...vazio, servidores }} />,
    );
    expect(
      [...container.querySelectorAll("dd")].map(
        (el) => el.firstChild?.textContent,
      ),
    ).toEqual(["3", "1", "0"]);
  });
  it("requisitos não prometem funções ou formatos indisponíveis", () => {
    render(<ServidorPreparacao />);
    expect(screen.getByText(/Até 3 MB, com index.html na raiz/)).toBeTruthy();
    expect(screen.getByText(/Sem PHP e sem .htaccess/)).toBeTruthy();
    expect(screen.getByText(/Você confirma a identidade/)).toBeTruthy();
  });
  it("mantém pendência de configuração aberta e explica a origem", () => {
    const { container } = render(
      <ServidorPreparacao
        estado={{
          ...vazio,
          pendencias: [
            {
              chave: "https",
              ok: false,
              texto: "Configure HTTPS",
              ondePegar: "Vercel",
            },
          ],
        }}
      />,
    );
    expect(container.querySelector("details")?.open).toBe(true);
    expect(screen.getByText("0/1 itens prontos")).toBeTruthy();
    expect(screen.getByText("Onde pegar: Vercel")).toBeTruthy();
  });
  it("todos os atalhos levam a páginas existentes e explicam métricas ausentes", () => {
    render(<ServidorRecursos />);
    expect(
      screen.getAllByRole("link").map((el) => el.getAttribute("href")),
    ).toEqual(["/servidor/sites", "/servidor/sites", "/editor/landing-page"]);
    expect(
      screen.getByText(/Sem servidor, não há métricas para exibir/),
    ).toBeTruthy();
  });
  it.each([
    ["/servidor", "Servidores"],
    ["/servidor/novo", "Conectar VPS"],
    ["/servidor/sites/123", "Sites e arquivos"],
  ])("navegação identifica %s sem criar abas falsas", (path, label) => {
    rota.atual = path;
    render(<ServidorNavigation />);
    const nav = screen.getByRole("navigation", {
      name: "Navegação do servidor",
    });
    expect(
      within(nav)
        .getByRole("link", { name: label })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});
