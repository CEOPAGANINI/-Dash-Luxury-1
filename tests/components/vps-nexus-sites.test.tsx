import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SitesPainel } from "@/features/vps/sites-painel";
import type { EstadoDaTela } from "@/features/vps/vps-cliente";
import type { ServidorDTO } from "@/features/vps/modelo";
import styles from "@/features/vps/sites-nexus.module.css";

vi.mock("@/features/vps/actions", () => ({ criarSiteAction: vi.fn() }));
vi.mock("@/features/vps/use-estado-vps", () => ({
  useEstadoVps: (inicial: EstadoDaTela) => ({
    estado: inicial,
    falha: null,
    atualizar: vi.fn(),
  }),
}));

afterEach(cleanup);

const inicial: EstadoDaTela = {
  agora: "2026-09-24T19:00:00Z",
  servidores: [],
  sites: [],
  checkouts: [],
  origens: ["https://painel.test"],
  appUrl: "https://painel.test",
  comandoDesinstalar: { manterSites: "", removerSites: "" },
  podeAlterar: true,
  pendencias: [],
};

const ativo = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "VPS confirmada",
  estado: "ativo",
} as ServidorDTO;

describe("CommandLayer: sites e arquivos", () => {
  it("monta as duas camadas de material no início e nas etapas", () => {
    const { container } = render(<SitesPainel inicial={inicial} />);
    const inicio = screen.getByRole("region", {
      name: "Suas páginas. Seu espaço na web.",
    });
    expect(
      inicio.firstElementChild?.classList.contains(styles.launchInner),
    ).toBe(true);
    expect(container.querySelectorAll(`.${styles.stepInner}`)).toHaveLength(3);
    expect(
      container.querySelector('[data-icon="solar:file-zip-linear"]'),
    ).toBeTruthy();
  });
  it("transforma o vazio em um início de publicação sem inventar arquivos ou estado ao vivo", () => {
    const { container } = render(<SitesPainel inicial={inicial} />);
    expect(
      screen.getByRole("heading", { name: "Suas páginas. Seu espaço na web." }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Conecte e confirme um servidor antes de criar um site.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Exemplo de organização. Nenhum arquivo foi enviado."),
    ).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+%|\d+\.\d+\.\d+\.\d+|Online/);
  });

  it("leva para a conexão, servidores e editor existentes", () => {
    render(<SitesPainel inicial={inicial} />);
    expect(
      screen
        .getByRole("link", { name: "Conectar minha VPS" })
        .getAttribute("href"),
    ).toBe("/servidor/novo");
    expect(
      screen.getByRole("link", { name: "Ver servidores" }).getAttribute("href"),
    ).toBe("/servidor");
    expect(
      screen
        .getByRole("link", { name: "Preparar página no editor" })
        .getAttribute("href"),
    ).toBe("/editor/landing-page");
  });

  it("explica a ordem real de publicação e o contrato do ZIP", () => {
    render(<SitesPainel inicial={inicial} />);
    const guide = screen.getByRole("region", { name: "Do arquivo ao domínio" });
    expect(within(guide).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(guide).getByText(/O painel confere o endereço antes de mostrar/),
    ).toBeTruthy();
    expect(screen.getByText(/ZIP de até 3 MB/)).toBeTruthy();
    expect(screen.getByText(/na raiz, sem PHP e sem .htaccess/)).toBeTruthy();
    expect(screen.getByText("css/")).toBeTruthy();
    expect(screen.getByText("fontes/")).toBeTruthy();
  });

  it("não libera o formulário antes da confirmação do servidor", () => {
    render(
      <SitesPainel
        inicial={{
          ...inicial,
          servidores: [{ ...ativo, estado: "aguardando_confirmacao" }],
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Criar site" })).toBeNull();
    expect(screen.getByText("Aguardando um servidor confirmado")).toBeTruthy();
  });

  it("mantém o formulário real e o identificador do servidor confirmado", () => {
    const { container } = render(
      <SitesPainel inicial={{ ...inicial, servidores: [ativo] }} />,
    );
    expect(screen.getByLabelText("Nome do site")).toBeTruthy();
    expect(screen.getByLabelText("Domínio")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Criar site" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      container.querySelector<HTMLInputElement>('input[name="servidorId"]')
        ?.value,
    ).toBe(ativo.id);
    expect(screen.queryByText("Aguardando um servidor confirmado")).toBeNull();
    const requisitos = screen.getByRole("complementary", {
      name: "Prepare o seu ZIP",
    });
    expect(
      requisitos.firstElementChild?.classList.contains(
        styles.requirementsInner,
      ),
    ).toBe(true);
    expect(within(requisitos).getByText("3 MB por ZIP")).toBeTruthy();
    expect(within(requisitos).getByText("PHP e .htaccess")).toBeTruthy();
    expect(
      within(requisitos)
        .getByRole("link", { name: "Abrir editor do funil" })
        .getAttribute("href"),
    ).toBe("/editor/landing-page");
  });

  it("mantém somente leitura mesmo com um servidor confirmado", () => {
    render(
      <SitesPainel
        inicial={{ ...inicial, servidores: [ativo], podeAlterar: false }}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Criar site" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByLabelText("Domínio").hasAttribute("disabled")).toBe(
      true,
    );
  });
});
