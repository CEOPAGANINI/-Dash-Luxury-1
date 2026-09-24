import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PendenciaVps } from "@/features/vps/acesso";
import type {
  ReleaseDTO,
  ServidorDetalheDTO,
  ServidorDTO,
  SiteDetalheDTO,
  SiteDTO,
  TarefaDTO,
} from "@/features/vps/modelo";
import { NovoServidor } from "@/features/vps/novo-servidor";
import {
  FRASE_DO_DEMO,
  PainelIndisponivel,
} from "@/features/vps/pre-requisitos";
import { ServidorDetalhe } from "@/features/vps/servidor-detalhe";
import { ServidoresPainel } from "@/features/vps/servidores-painel";
import { SiteDetalhe } from "@/features/vps/site-detalhe";
import { SitesPainel } from "@/features/vps/sites-painel";
import type { EstadoDaTela } from "@/features/vps/vps-cliente";

/*
  As cinco telas do Servidor com dados montados à mão (as actions e o
  fetch são falsos). O que se prova aqui é o que o dono vê: frases de
  vazio e de estado, "No ar" só com conferência, confirmações em dois
  passos, validação antes de gastar a action — e as regras da pele
  (nenhum <select>, nenhum h1, botão com ícone sempre com o texto num
  <span>).
*/

const acoes = vi.hoisted(() => ({
  criarServidorAction: vi.fn(),
  novaInstalacaoAction: vi.fn(),
  confirmarServidorAction: vi.fn(),
  informarIpAction: vi.fn(),
  lerAgoraAction: vi.fn(),
  removerServidorAction: vi.fn(),
  criarSiteAction: vi.fn(),
  alterarDominiosAction: vi.fn(),
  alterarCheckoutAction: vi.fn(),
  reaplicarSiteAction: vi.fn(),
  verificarDnsAction: vi.fn(),
  emitirSslAction: vi.fn(),
  ativarVersaoAction: vi.fn(),
  conferirPublicoAction: vi.fn(),
  removerSiteAction: vi.fn(),
  forcarRemocaoSiteAction: vi.fn(),
  reentrarAction: vi.fn(),
}));
vi.mock("@/features/vps/actions", () => acoes);

const AGORA = "2026-09-23T21:12:00.000Z";
const SRV = "11111111-1111-4111-8111-111111111111";
const SRV2 = "22222222-2222-4222-8222-222222222222";
const SITE = "33333333-3333-4333-8333-333333333333";
const V1 = "44444444-4444-4444-8444-444444444444";
const V2 = "55555555-5555-4555-8555-555555555555";
const CK1 = "66666666-6666-4666-8666-666666666666";
const CK2 = "77777777-7777-4777-8777-777777777777";
const IP = "51.15.0.10";
const GB = 1024 ** 3;

function servidorDTO(extra: Partial<ServidorDTO> = {}): ServidorDTO {
  return {
    id: SRV,
    nome: "VPS da loja",
    estado: "ativo",
    sinal: { tipo: "online", ultimoPulsoEm: "2026-09-23T21:11:48.000Z" },
    instalacao: null,
    registro: {
      hostname: "srv-loja",
      so: "Ubuntu 24.04.1 LTS",
      ipVisto: IP,
      ipsPublicos: [IP],
      registradoEm: "2026-09-20T12:00:00.000Z",
    },
    ipDoDns: IP,
    ipInformado: null,
    versaoAgente: "1.0.0",
    travas: { pausado: false, somenteLeitura: false },
    geracaoChave: 2,
    relogio: null,
    nginx: { versao: "1.24.0", configOk: true, ativo: true },
    leitura: {
      em: "2026-09-23T21:10:00.000Z",
      cpuPercent: 7,
      cpuCores: 2,
      memoria: { usadoBytes: 1 * GB, totalBytes: 4 * GB },
      disco: { usadoBytes: 20 * GB, totalBytes: 40 * GB },
      uptimeSegundos: 86_400,
      avisos: [],
    },
    erroLeitura: null,
    totalSites: 1,
    ...extra,
  };
}

function versao(extra: Partial<ReleaseDTO> = {}): ReleaseDTO {
  return {
    id: V1,
    arquivo: "loja-v1.zip",
    criadaEm: "2026-09-23T21:10:00.000Z",
    por: "dono@loja.com.br",
    arquivos: 12,
    bytes: 900_000,
    bytesZip: 400_000,
    paginas: {
      landing: "index.html",
      obrigado: "obrigado/index.html",
      legais: [],
    },
    temRastreio: true,
    estado: "no_servidor",
    ativa: true,
    ativadaEm: "2026-09-23T21:10:30.000Z",
    erro: null,
    avisos: [],
    ...extra,
  };
}

function siteDTO(extra: Partial<SiteDTO> = {}): SiteDTO {
  return {
    id: SITE,
    servidorId: SRV,
    servidorNome: "VPS da loja",
    nome: "Cadeira X",
    slug: "cadeira-x",
    estado: "ativo",
    dominios: [
      {
        hostname: "loja.com.br",
        principal: true,
        dns: "ok",
        verificadoEm: "2026-09-23T21:08:00.000Z",
        detalhe: { a: [IP] },
      },
      {
        hostname: "www.loja.com.br",
        principal: false,
        dns: "outro_ip",
        verificadoEm: "2026-09-23T21:08:00.000Z",
        detalhe: { a: ["104.21.0.1"] },
      },
    ],
    checkout: {
      origem: "https://painel.com.br",
      url: "https://painel.com.br/checkout/cadeira-x",
      aviso: null,
    },
    nginx: { aplicadoEm: "2026-09-23T20:00:00.000Z", erro: null },
    https: {
      estado: "sem_ssl",
      validoAte: null,
      conferidoEm: null,
      erro: null,
      podeTentarEm: null,
    },
    naVps: "presente",
    versaoAtiva: versao(),
    servidorInforma: V1,
    rastreioProduto: "cadeira-x",
    noAr: { estado: "nao_conferido", url: null, em: null, detalhe: null },
    ...extra,
  };
}

function tarefa(extra: Partial<TarefaDTO> = {}): TarefaDTO {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    tipo: "site.configurar",
    rotulo: "Configurar o site",
    estado: "concluida",
    rotuloEstado: "Concluída",
    criadaEm: "2026-09-23T20:00:00.000Z",
    entregueEm: "2026-09-23T20:00:05.000Z",
    concluidaEm: "2026-09-23T20:00:07.000Z",
    expiraEm: "2026-09-23T20:10:00.000Z",
    erro: null,
    por: "dono@loja.com.br",
    ...extra,
  };
}

function siteDetalhe(extra: Partial<SiteDetalheDTO> = {}): SiteDetalheDTO {
  return {
    ...siteDTO(),
    ipsEsperados: { ipv4: [IP], ipv6: [] },
    versoes: [
      versao(),
      versao({
        id: V2,
        arquivo: "loja-v0.zip",
        criadaEm: "2026-09-22T15:00:00.000Z",
        ativa: false,
        ativadaEm: null,
      }),
    ],
    tarefas: [tarefa()],
    tarefaAberta: null,
    podeForcarRemocao: false,
    ...extra,
  };
}

function servidorDetalhe(
  extra: Partial<ServidorDetalheDTO> = {},
): ServidorDetalheDTO {
  return {
    ...servidorDTO(),
    ipsEsperados: { ipv4: [IP], ipv6: [] },
    confirmado: { em: "2026-09-20T12:05:00.000Z", por: "dono@loja.com.br" },
    sites: [siteDTO()],
    tarefas: [tarefa()],
    ...extra,
  };
}

const CHAVES: PendenciaVps["chave"][] = [
  "banco",
  "donos",
  "email_confirmado",
  "chave",
  "https",
  "origem_checkout",
  "tabelas",
];

function pendencias(faltam: PendenciaVps["chave"][] = []): PendenciaVps[] {
  return CHAVES.map((chave) => ({
    chave,
    ok: !faltam.includes(chave),
    texto: `Texto de ${chave}`,
    ondePegar: `Onde de ${chave}`,
  }));
}

function estado(extra: Partial<EstadoDaTela> = {}): EstadoDaTela {
  return {
    agora: AGORA,
    servidores: [servidorDTO()],
    sites: [siteDTO()],
    checkouts: [
      {
        id: CK1,
        nome: "Cadeira X",
        slug: "cadeira-x",
        produtoSlug: "cadeira-x",
      },
      { id: CK2, nome: "Mesa Y", slug: "mesa-y", produtoSlug: "mesa-y" },
    ],
    origens: ["https://painel.com.br"],
    appUrl: "https://painel.com.br",
    comandoDesinstalar: {
      manterSites: "sudo dash-agent desinstalar",
      removerSites: "sudo dash-agent desinstalar --remover-sites",
    },
    podeAlterar: true,
    pendencias: pendencias(),
    ...extra,
  };
}

function respostaDoEstado(corpo: EstadoDaTela) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    json: () => Promise.resolve({ ok: true, ...corpo }),
  } as unknown as Response;
}

beforeEach(() => {
  for (const acao of Object.values(acoes)) acao.mockReset();
  // O polling só pergunta quando o teste pede; por padrão, nunca responde.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** As regras que a pele legada pune e o dono proibiu. */
function conferirDesenho(container: HTMLElement) {
  expect(container.querySelectorAll("select")).toHaveLength(0);
  expect(container.querySelectorAll("h1")).toHaveLength(0);
  for (const el of container.querySelectorAll<HTMLElement>(
    "button, [data-slot=button]",
  )) {
    if (!el.querySelector("svg")) continue;
    const texto = [...el.querySelectorAll("span")]
      .map((s) => s.textContent?.trim())
      .filter(Boolean);
    expect(
      texto.length,
      `botão com ícone sem <span>: ${el.outerHTML}`,
    ).toBeGreaterThan(0);
  }
}

// ---------------------------------------------------------------------------

describe("antes do painel (PainelIndisponivel)", () => {
  it("demo: a frase e o 'Como funciona', sem número, IP, formulário nem servidor", () => {
    const { container } = render(
      <PainelIndisponivel painel={{ estado: "demo" }} />,
    );
    expect(screen.getByText(FRASE_DO_DEMO)).toBeTruthy();
    expect(screen.getByText("Do comando ao site no ar")).toBeTruthy();
    expect(
      container.querySelectorAll("form, input, button, select"),
    ).toHaveLength(0);
    expect(container.textContent).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(container.textContent).not.toMatch(/%|GB|Online/);
    // Não repete o banner do modo demo.
    expect(container.textContent).not.toMatch(/Sem dados conectados/);
  });

  it("sem permissão: só a frase", () => {
    const { container } = render(
      <PainelIndisponivel
        painel={{
          estado: "sem_permissao",
          motivo:
            "Sua conta (x@y.com) não está em VPS_DONOS (ou o e-mail não foi confirmado).",
        }}
      />,
    );
    expect(container.textContent).toBe(
      "Sua conta (x@y.com) não está em VPS_DONOS (ou o e-mail não foi confirmado).",
    );
  });

  it("configurar: todas as pendências de uma vez, com ✔/✘ e onde pegar", () => {
    render(
      <PainelIndisponivel
        painel={{
          estado: "configurar",
          pendencias: pendencias(["chave", "tabelas"]),
        }}
      />,
    );
    expect(
      screen.getByText("Faltam 2 itens para o Servidor funcionar"),
    ).toBeTruthy();
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(7);
    expect(itens.filter((i) => i.textContent?.includes("✘"))).toHaveLength(2);
    expect(itens.filter((i) => i.textContent?.includes("✔"))).toHaveLength(5);
    expect(screen.getByText("Onde pegar: Onde de chave")).toBeTruthy();
    expect(screen.queryByText("Onde pegar: Onde de banco")).toBeNull();
  });

  it("erro de leitura: alerta com o motivo, nunca lista vazia", () => {
    render(
      <PainelIndisponivel
        painel={{ estado: "erro", mensagem: "tabela sumiu" }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Não foi possível ler os servidores: tabela sumiu",
    );
  });
});

// ---------------------------------------------------------------------------

describe("/servidor", () => {
  it("vazio: uma frase com o link para adicionar", () => {
    render(
      <ServidoresPainel inicial={estado({ servidores: [], sites: [] })} />,
    );
    expect(screen.getByText(/Nenhum servidor conectado ainda\./)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Adicionar servidor" })
        .getAttribute("href"),
    ).toBe("/servidor/novo");
  });

  it("cartão: selo de sinal, IP, hostname, sistema, sites, medidas e 'Abrir'", () => {
    const { container } = render(<ServidoresPainel inicial={estado()} />);
    const cartao = screen
      .getByRole("heading", { name: "VPS da loja" })
      .closest("section")!;
    const noCartao = within(cartao);
    expect(noCartao.getByText("Online · sinal há 12 s")).toBeTruthy();
    expect(noCartao.getByText(IP)).toBeTruthy();
    expect(noCartao.getByText("srv-loja")).toBeTruthy();
    expect(noCartao.getByText("Ubuntu 24.04.1 LTS")).toBeTruthy();
    expect(noCartao.getByText("1 site")).toBeTruthy();
    expect(
      noCartao.getByRole("img", { name: "Disco /: Usado 50%" }),
    ).toBeTruthy();
    expect(
      noCartao.getByRole("link", { name: "Abrir" }).getAttribute("href"),
    ).toBe(`/servidor/${SRV}`);
    conferirDesenho(container);
  });

  it("servidor esperando instalação: selo com a validade e sem medidas inventadas", () => {
    render(
      <ServidoresPainel
        inicial={estado({
          servidores: [
            servidorDTO({
              estado: "aguardando_agente",
              sinal: { tipo: "nunca", ultimoPulsoEm: null },
              instalacao: { expiraEm: "2026-09-23T21:40:00.000Z" },
              registro: null,
              ipDoDns: null,
              leitura: null,
              nginx: null,
              totalSites: 0,
            }),
          ],
        })}
      />,
    );
    expect(
      screen.getByText("Aguardando instalação (vale até 18:40)"),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("pendência aberta mostra o bloco Configuração com a lista inteira", () => {
    render(
      <ServidoresPainel
        inicial={estado({ pendencias: pendencias(["https"]) })}
      />,
    );
    expect(
      screen.getByText("Falta 1 item para o Servidor funcionar"),
    ).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------

describe("/servidor/novo", () => {
  const instalacao = {
    comando:
      "T=$(mktemp -d) && curl -fsSL https://painel.com.br/agente/v1/instalar.sh",
    expiraEm: "2026-09-23T21:42:00.000Z",
    sha256Instalador: "0".repeat(64),
  };

  it("sem chave mestra, o formulário fica desligado e diz por quê", () => {
    render(<NovoServidor inicial={estado({ podeAlterar: false })} />);
    expect(
      screen
        .getByRole("button", { name: "Gerar comando" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(/Falta VPS_CHAVE_MESTRA/)).toBeTruthy();
  });

  it("nome vazio é recusado na tela, sem gastar a action", async () => {
    render(<NovoServidor inicial={estado()} />);
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Gerar comando" }).closest("form")!,
      );
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Dê um nome ao servidor.",
    );
    expect(acoes.criarServidorAction).not.toHaveBeenCalled();
  });

  it("do comando ao 'é o meu': comando só na memória, espera e confirmação", async () => {
    acoes.criarServidorAction.mockResolvedValue({
      ok: true,
      mensagem:
        "Servidor criado. Cole o comando no console da VPS e aperte Enter.",
      dados: { servidorId: SRV2, instalacao },
    });
    const registrado = estado({
      agora: "2026-09-23T21:13:00.000Z",
      servidores: [
        servidorDTO({
          id: SRV2,
          nome: "Nova VPS",
          estado: "aguardando_confirmacao",
          registro: {
            hostname: "srv-novo",
            so: "Debian GNU/Linux 12",
            ipVisto: IP,
            ipsPublicos: [IP],
            registradoEm: "2026-09-23T21:12:40.000Z",
          },
        }),
      ],
    });
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const { container } = render(
      <NovoServidor inicial={estado({ servidores: [] })} />,
    );

    fireEvent.change(screen.getByLabelText("Nome do servidor"), {
      target: { value: "Nova VPS" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar comando" }));
    });
    const dados = acoes.criarServidorAction.mock.calls[0][1] as FormData;
    expect(dados.get("nome")).toBe("Nova VPS");

    // O comando aparece uma vez, com a validade e o aviso do sha256.
    expect(container.querySelector("pre code")?.textContent).toBe(
      instalacao.comando,
    );
    expect(screen.getByText("Vale até 18:42 · aparece só agora")).toBeTruthy();
    expect(
      screen.getByText(/não protege contra um painel comprometido/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Esperando o servidor… A tela confere sozinha a cada 5 s.",
      ),
    ).toBeTruthy();
    // E a tela perguntou na hora, sem esperar o intervalo.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    // O agente se registrou: a próxima leitura traz o que ele relatou.
    fetch.mockImplementation(() =>
      Promise.resolve(respostaDoEstado(registrado)),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Nome do servidor"), {
        target: { value: "" },
      });
    });
    acoes.criarServidorAction.mockClear();
    acoes.confirmarServidorAction.mockResolvedValue({
      ok: true,
      mensagem:
        "Servidor confirmado. 2 sites serão reaplicados neste servidor.",
      dados: { sitesReaplicados: 2 },
    });
    // Força a próxima pergunta (a ilha pergunta sozinha a cada 5 s).
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await screen.findByText("É o seu servidor?");
    expect(screen.getByText("srv-novo")).toBeTruthy();
    expect(screen.getByText("Debian GNU/Linux 12")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sim, é o meu" }));
    });
    const confirmacao = acoes.confirmarServidorAction.mock
      .calls[0][1] as FormData;
    expect(confirmacao.get("servidorId")).toBe(SRV2);
    expect(confirmacao.get("resposta")).toBe("sim");
    expect(
      screen.getByText(
        "Servidor confirmado. 2 sites serão reaplicados neste servidor.",
      ),
    ).toBeTruthy();
    conferirDesenho(container);
  });
});

// ---------------------------------------------------------------------------

describe("/servidor/[servidorId]", () => {
  function comServidor(extra: Partial<ServidorDetalheDTO> = {}) {
    const servidor = servidorDetalhe(extra);
    return estado({ servidores: [servidor], servidor });
  }

  it("sinal, saúde, nginx, sites, tarefas e agente, sem linha de e-mails", () => {
    const { container } = render(
      <ServidorDetalhe inicial={comServidor()} servidorId={SRV} />,
    );
    expect(
      screen.getAllByText("Online · sinal há 12 s").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: "Disco /: Usado 50%" }),
    ).toBeTruthy();
    expect(screen.getByText("Configuração ok")).toBeTruthy();
    expect(screen.getByText("Ligado")).toBeTruthy();
    expect(
      screen.getByText(
        "Somente leitura: este painel não inicia nem interrompe serviços.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Cadeira X" }).getAttribute("href"),
    ).toBe(`/servidor/sites/${SITE}`);
    expect(screen.getByText("geração 2")).toBeTruthy();
    expect(screen.getByText("sudo dash-agent desinstalar")).toBeTruthy();
    expect(container.textContent).not.toMatch(
      /e-mails? (ligad|desligad)|avisos por e-mail/i,
    );
    conferirDesenho(container);
  });

  it("relógio fora de hora e travas locais aparecem, sem o painel desfazer", () => {
    render(
      <ServidorDetalhe
        inicial={comServidor({
          relogio: { desvioSegundos: -420 },
          travas: { pausado: true, somenteLeitura: true },
        })}
        servidorId={SRV}
      />,
    );
    expect(
      screen.getByText(
        /O relógio da VPS está 7 min fora de hora\. O agente compensa/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Pausado na VPS: o painel não desfaz/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Somente leitura na VPS: o painel não desfaz/),
    ).toBeTruthy();
  });

  it("sem tarefas e sem sites: as frases de vazio", () => {
    render(
      <ServidorDetalhe
        inicial={comServidor({ tarefas: [], sites: [], totalSites: 0 })}
        servidorId={SRV}
      />,
    );
    expect(
      screen.getByText("Nenhuma tarefa enviada a este servidor ainda."),
    ).toBeTruthy();
    expect(screen.getByText("Nenhum site neste servidor.")).toBeTruthy();
  });

  it("IP informado inválido é recusado antes da action", async () => {
    render(<ServidorDetalhe inicial={comServidor()} servidorId={SRV} />);
    fireEvent.change(screen.getByLabelText("Informar IP público"), {
      target: { value: "192.168.0.10" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gravar IP" }));
    });
    expect(acoes.informarIpAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Digite um IPv4 público/)).toBeTruthy();
  });

  it("'Ler agora' manda a action com o servidor e pergunta o estado na hora", async () => {
    acoes.lerAgoraAction.mockResolvedValue({
      ok: true,
      mensagem: "Leitura pedida. O servidor busca em até 30 s.",
      dados: { tarefaId: "t" },
    });
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    render(<ServidorDetalhe inicial={comServidor()} servidorId={SRV} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ler agora" }));
    });
    expect(
      (acoes.lerAgoraAction.mock.calls[0][1] as FormData).get("servidorId"),
    ).toBe(SRV);
    expect(
      screen.getByText("Leitura pedida. O servidor busca em até 30 s."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/painel/vps/estado?servidor=${SRV}`,
        expect.anything(),
      ),
    );
  });

  it("remover digitando o nome; depois, os comandos de desinstalação continuam à vista", async () => {
    acoes.removerServidorAction.mockResolvedValue({
      ok: true,
      mensagem: "Servidor removido do painel.",
      dados: {},
    });
    const sem = estado({ servidores: [], sites: [], servidor: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(respostaDoEstado(sem))),
    );
    render(<ServidorDetalhe inicial={comServidor()} servidorId={SRV} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover servidor" }));
    fireEvent.change(
      screen.getByLabelText(/Digite VPS da loja para confirmar/),
      {
        target: { value: "VPS da loja" },
      },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Remover do painel" }),
      );
    });
    const dados = acoes.removerServidorAction.mock.calls[0][1] as FormData;
    expect(dados.get("confirmacao")).toBe("VPS da loja");
    await screen.findByText("Servidor removido do painel");
    expect(
      screen.getByText("sudo dash-agent desinstalar --remover-sites"),
    ).toBeTruthy();
  });

  it("esperando confirmação: o bloco 'É o seu servidor?' aparece aqui também", () => {
    render(
      <ServidorDetalhe
        inicial={comServidor({ estado: "aguardando_confirmacao" })}
        servidorId={SRV}
      />,
    );
    expect(screen.getByText("É o seu servidor?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Não é o meu" })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------

describe("/servidor/sites", () => {
  it("tabela com as sete colunas e o 'No ar' honesto", () => {
    const { container } = render(<SitesPainel inicial={estado()} />);
    const cabecalhos = [...container.querySelectorAll("thead th")].map(
      (th) => th.textContent,
    );
    expect(cabecalhos).toEqual([
      "Site",
      "Domínio",
      "Servidor",
      "Versão ativa",
      "No ar",
      "HTTPS",
      "DNS",
    ]);
    expect(screen.getByText("Não conferido")).toBeTruthy();
    expect(screen.getByText("1 de 2 certos")).toBeTruthy();
    expect(container.querySelector("table")?.className).toMatch(
      /min-w-\[720px\]/,
    );
    expect(container.querySelector("table")?.parentElement?.className).toMatch(
      /overflow-x-auto/,
    );
    conferirDesenho(container);
  });

  it("sem servidor ativo: pede para confirmar um servidor e não mostra o formulário", () => {
    render(
      <SitesPainel
        inicial={estado({
          servidores: [servidorDTO({ estado: "aguardando_confirmacao" })],
          sites: [],
        })}
      />,
    );
    expect(
      screen.getByText(
        /Conecte e confirme um servidor antes de criar um site\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Criar site" })).toBeNull();
  });

  it("com servidor ativo e sem site: a frase e o bloco Novo site", () => {
    render(<SitesPainel inicial={estado({ sites: [] })} />);
    expect(
      screen.getByText(
        "Nenhum site neste painel ainda. Crie o primeiro no bloco abaixo.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Criar site" })).toBeTruthy();
  });

  it("escolhas em blocos: servidor só com 2+, www, checkout com 'Nenhum' e copiar link", () => {
    const { container } = render(
      <SitesPainel
        inicial={estado({
          sites: [],
          servidores: [
            servidorDTO(),
            servidorDTO({ id: SRV2, nome: "Outra VPS" }),
          ],
          origens: ["https://painel.com.br", "https://checkout.loja.com.br"],
        })}
      />,
    );
    const grupos = screen.getAllByRole("radiogroup");
    expect(grupos).toHaveLength(4); // servidor, www, checkout, origem
    expect(
      within(grupos[2])
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Cadeira X", "Mesa Y", "Nenhum"]);
    expect(screen.getAllByRole("button", { name: "Copiar link" })).toHaveLength(
      2,
    );
    expect(
      screen.getByText("https://painel.com.br/checkout/mesa-y"),
    ).toBeTruthy();
    conferirDesenho(container);
  });

  it("com um servidor e uma origem, não há bloco de escolha para eles", () => {
    render(<SitesPainel inicial={estado({ sites: [] })} />);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2); // www e checkout
  });

  it("domínio inválido é recusado na tela; válido vai para a action com os blocos", async () => {
    acoes.criarSiteAction.mockResolvedValue({
      ok: true,
      mensagem: "Site criado.",
      dados: { siteId: SITE, tarefaId: "t" },
    });
    render(<SitesPainel inicial={estado({ sites: [] })} />);
    fireEvent.change(screen.getByLabelText("Nome do site"), {
      target: { value: "Mesa Y" },
    });
    fireEvent.change(screen.getByLabelText("Domínio"), {
      target: { value: "https://mesa.com.br/" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar site" }));
    });
    expect(acoes.criarSiteAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Digite só o domínio/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Domínio"), {
      target: { value: "mesa.com.br" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Não" }));
    fireEvent.click(screen.getByRole("radio", { name: "Mesa Y" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar site" }));
    });
    const dados = acoes.criarSiteAction.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(dados.entries())).toEqual({
      servidorId: SRV,
      nome: "Mesa Y",
      dominio: "mesa.com.br",
      incluirWww: "nao",
      checkoutId: CK2,
      origemCheckout: "https://painel.com.br",
    });
    expect(
      screen
        .getByRole("link", { name: "Abrir o site criado" })
        .getAttribute("href"),
    ).toBe(`/servidor/sites/${SITE}`);
  });

  it("o endereço do próprio painel não pode virar site", async () => {
    render(<SitesPainel inicial={estado({ sites: [] })} />);
    fireEvent.change(screen.getByLabelText("Nome do site"), {
      target: { value: "Painel" },
    });
    fireEvent.change(screen.getByLabelText("Domínio"), {
      target: { value: "painel.com.br" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Criar site" }));
    });
    expect(acoes.criarSiteAction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("/servidor/sites/[siteId]", () => {
  function comSite(extra: Partial<SiteDetalheDTO> = {}) {
    const site = siteDetalhe(extra);
    return estado({ sites: [site], site });
  }

  it("sem conferência não há 'No ar' nem link para abrir o site", () => {
    const { container } = render(
      <SiteDetalhe inicial={comSite()} siteId={SITE} />,
    );
    expect(screen.getAllByText("Não conferido").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/No ar em/);
    expect(screen.queryByRole("link", { name: "Abrir site" })).toBeNull();
    // O agente confirmou a versão: "Ativa no servidor" é outro nível de verdade.
    expect(screen.getByText("Ativa no servidor")).toBeTruthy();
    conferirDesenho(container);
  });

  it("com a conferência ok: 'No ar em …' com a versão e a hora, e 'Abrir site'", () => {
    render(
      <SiteDetalhe
        inicial={comSite({
          https: {
            estado: "ativo",
            validoAte: "2026-12-20T00:00:00.000Z",
            conferidoEm: "2026-09-23T21:05:00.000Z",
            erro: null,
            podeTentarEm: null,
          },
          noAr: {
            estado: "ok",
            url: "https://loja.com.br/",
            em: "2026-09-23T21:12:00.000Z",
            detalhe: null,
          },
        })}
        siteId={SITE}
      />,
    );
    expect(
      screen.getByText(
        "No ar em https://loja.com.br/: mostra a versão de 23/09 18:10 (conferido 18:12).",
      ),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Abrir site" });
    expect(link.getAttribute("href")).toBe("https://loja.com.br/");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    // A hora em que a validade foi lida na VPS (tls_checked_at), como no §9.
    expect(
      screen.getByText(
        "HTTPS ativo até 19/12/2026 (renovação automática; conferido 18:05).",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ativar HTTPS" })).toBeNull();
  });

  it("página de espera e 'outra coisa' dizem o que é, sem link", () => {
    render(
      <SiteDetalhe
        inicial={comSite({
          noAr: {
            estado: "outra_coisa",
            url: "https://loja.com.br/",
            em: "2026-09-23T21:12:00.000Z",
            detalhe: "status 200, conteúdo diferente",
          },
        })}
        siteId={SITE}
      />,
    );
    expect(
      screen.getByText(
        /Responde outra coisa \(conferido 18:12\): há DNS, CDN ou cache/,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Abrir site" })).toBeNull();
  });

  it("servidor sem o site: alerta e 'Reaplicar no servidor'", async () => {
    acoes.reaplicarSiteAction.mockResolvedValue({
      ok: true,
      mensagem: "Pedido enviado.",
      dados: { tarefaId: "t" },
    });
    render(
      <SiteDetalhe inicial={comSite({ naVps: "ausente" })} siteId={SITE} />,
    );
    expect(
      screen
        .getByText(
          "O servidor não tem este site (foi trocado ou reinstalado?). Reaplique e envie o ZIP de novo.",
        )
        .getAttribute("role"),
    ).toBe("alert");
    const botoes = screen.getAllByRole("button", {
      name: "Reaplicar no servidor",
    });
    expect(botoes).toHaveLength(2);
    await act(async () => {
      fireEvent.click(botoes[0]);
    });
    expect(
      (acoes.reaplicarSiteAction.mock.calls[0][1] as FormData).get("siteId"),
    ).toBe(SITE);
  });

  it("DNS: tabela do que criar e HTTPS desligado com o motivo escrito", () => {
    render(<SiteDetalhe inicial={comSite()} siteId={SITE} />);
    const linhas = screen.getAllByRole("row").map((r) => r.textContent);
    expect(linhas).toContain(
      `Awww.loja.com.br${IP}Aponta para outro IP (104.21.0.1). Cloudflare: deixe a nuvem cinza.`,
    );
    const ativar = screen.getByRole("button", { name: "Ativar HTTPS" });
    expect(ativar.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(`Falta o DNS de www.loja.com.br apontar para ${IP}.`),
    ).toBeTruthy();
    expect(screen.getByText(/Na última verificação \(18:08\)/)).toBeTruthy();
  });

  it("versões: estados honestos, aviso de divergência e 'Voltar para esta' em dois passos", async () => {
    acoes.ativarVersaoAction.mockResolvedValue({
      ok: true,
      mensagem: "Pedido enviado.",
      dados: { tarefaId: "t", siteId: SITE },
    });
    render(
      <SiteDetalhe
        inicial={comSite({ servidorInforma: "vazio" })}
        siteId={SITE}
      />,
    );
    expect(
      screen.getByText("Ativa (o servidor ainda não confirmou)"),
    ).toBeTruthy();
    expect(screen.getByText("Guardada no servidor")).toBeTruthy();
    expect(
      screen.getByText(/O servidor diz que ainda mostra a página de espera/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Voltar usa as cópias guardadas no servidor. Se o servidor for trocado, envie o ZIP de novo.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para esta" }));
    expect(acoes.ativarVersaoAction).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Confirmar a volta" }),
      );
    });
    expect(
      (acoes.ativarVersaoAction.mock.calls[0][1] as FormData).get("versaoId"),
    ).toBe(V2);
  });

  it("sem versões: a frase da página de espera", () => {
    render(
      <SiteDetalhe
        inicial={comSite({
          versoes: [],
          versaoAtiva: null,
          servidorInforma: "vazio",
        })}
        siteId={SITE}
      />,
    );
    expect(
      screen.getByText(
        "Nenhuma versão enviada. O site mostra a página de espera.",
      ),
    ).toBeTruthy();
  });

  it("páginas: obrigado estático, upsell ausente e o checkout via /checkout", () => {
    render(<SiteDetalhe inicial={comSite()} siteId={SITE} />);
    expect(
      screen.getByText(
        /arquivo presente \(página estática\): obrigado\/index\.html/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Depois do pagamento o cliente volta para o checkout do painel, não para o obrigado deste site\./,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("não existe nesta versão").length).toBe(2);
    expect(
      screen.getByText(
        "no painel, via /checkout → https://painel.com.br/checkout/cadeira-x",
      ),
    ).toBeTruthy();
  });

  it("rastreio: snippet com o produto e 'presente nesta versão'", () => {
    render(<SiteDetalhe inicial={comSite()} siteId={SITE} />);
    expect(
      screen.getByText(
        '<script src="https://painel.com.br/agente/v1/rastreio.js" data-produto="cadeira-x" defer></script>',
      ),
    ).toBeTruthy();
    expect(screen.getByText("presente")).toBeTruthy();
  });

  it("checkout despublicado mostra o aviso", () => {
    render(
      <SiteDetalhe
        inicial={comSite({
          checkout: {
            origem: "https://painel.com.br",
            url: "https://painel.com.br/checkout/sumiu",
            aviso: "O checkout escolhido foi despublicado ou apagado.",
          },
        })}
        siteId={SITE}
      />,
    );
    expect(
      screen.getByText("O checkout escolhido foi despublicado ou apagado."),
    ).toBeTruthy();
  });

  describe("publicar", () => {
    function escolher(arquivo: File) {
      const entrada =
        document.querySelector<HTMLInputElement>("input[type=file]")!;
      fireEvent.change(entrada, { target: { files: [arquivo] } });
    }

    it("ZIP acima de 3 MB é recusado na tela, sem envio", () => {
      const fetch = vi.fn(() => new Promise(() => {}));
      vi.stubGlobal("fetch", fetch);
      render(<SiteDetalhe inicial={comSite()} siteId={SITE} />);
      const grande = new File(["x"], "site.zip");
      Object.defineProperty(grande, "size", { value: 3_500_000 });
      escolher(grande);
      expect(screen.getByRole("alert").textContent).toMatch(/limite é 3 MB/);
      expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("confirma em dois passos e mostra os problemas do 422 (arquivo + motivo)", async () => {
      const fetch = vi.fn((url: string) =>
        url === "/api/painel/vps/publicar"
          ? Promise.resolve({
              ok: false,
              status: 422,
              redirected: false,
              json: () =>
                Promise.resolve({
                  ok: false,
                  codigo: "zip_com_problemas",
                  error: "O ZIP tem problemas",
                  problemas: [
                    {
                      arquivo: "script.php",
                      motivo:
                        "tipo de arquivo não permitido (só páginas estáticas)",
                    },
                  ],
                }),
            } as unknown as Response)
          : new Promise<Response>(() => {}),
      );
      vi.stubGlobal("fetch", fetch);
      const { container } = render(
        <SiteDetalhe inicial={comSite()} siteId={SITE} />,
      );
      escolher(new File(["PK"], "loja.zip"));
      expect(screen.getByText("loja.zip · 2 B")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
      expect(
        screen.getByText(
          "Publicar em loja.com.br agora? A versão atual continua guardada no servidor.",
        ),
      ).toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Publicar agora" }));
      });
      expect(fetch).toHaveBeenCalledWith(
        "/api/painel/vps/publicar",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByText("O ZIP tem problemas")).toBeTruthy();
      const item = screen.getByText("script.php").closest("li")!;
      expect(item.textContent).toBe(
        "script.php: tipo de arquivo não permitido (só páginas estáticas)",
      );
      conferirDesenho(container);
    });

    it("com tarefa em andamento, o envio espera (e diz por quê)", () => {
      render(
        <SiteDetalhe
          inicial={comSite({
            tarefaAberta: tarefa({
              tipo: "site.publicar",
              rotulo: "Publicar versão",
              estado: "pendente",
              rotuloEstado: "Na fila: o servidor busca em até 30 s",
            }),
          })}
          siteId={SITE}
        />,
      );
      expect(
        screen.getByText(
          "Em andamento: Publicar versão — Na fila: o servidor busca em até 30 s (vence às 17:10).",
        ),
      ).toBeTruthy();
      expect(
        document.querySelector<HTMLInputElement>("input[type=file]")!.disabled,
      ).toBe(true);
      expect(
        screen.getAllByText(/Espere a tarefa em andamento terminar/).length,
      ).toBeGreaterThan(0);
    });

    it("login antigo no upload oferece entrar de novo", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === "/api/painel/vps/publicar"
            ? Promise.resolve({
                ok: false,
                status: 403,
                redirected: false,
                json: () =>
                  Promise.resolve({
                    ok: false,
                    codigo: "login_antigo",
                    error: "Entre de novo para publicar.",
                  }),
              } as unknown as Response)
            : new Promise<Response>(() => {}),
        ),
      );
      render(<SiteDetalhe inicial={comSite()} siteId={SITE} />);
      escolher(new File(["PK"], "loja.zip"));
      fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Publicar agora" }));
      });
      expect(screen.getByText("Entre de novo para publicar.")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Entrar de novo" }),
      ).toBeTruthy();
    });
  });

  it("remover digitando o domínio; forçar só aparece quando o servidor não respondeu", async () => {
    acoes.removerSiteAction.mockResolvedValue({
      ok: true,
      mensagem: "Remoção pedida.",
      dados: { tarefaId: "t" },
    });
    const { unmount } = render(
      <SiteDetalhe inicial={comSite()} siteId={SITE} />,
    );
    expect(
      screen.queryByRole("button", {
        name: "Remover do painel mesmo sem resposta",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remover site" }));
    fireEvent.change(
      screen.getByLabelText(/Digite loja\.com\.br para confirmar/),
      {
        target: { value: "loja.com.br" },
      },
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover o site" }));
    });
    const dados = acoes.removerSiteAction.mock.calls[0][1] as FormData;
    expect(dados.get("siteId")).toBe(SITE);
    expect(dados.get("confirmacao")).toBe("loja.com.br");
    unmount();

    render(
      <SiteDetalhe
        inicial={comSite({ estado: "removendo", podeForcarRemocao: true })}
        siteId={SITE}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Remover do painel mesmo sem resposta",
      }),
    ).toBeTruthy();
  });

  it("site que saiu do painel: frase e link para a lista", () => {
    render(<SiteDetalhe inicial={estado({ site: null })} siteId={SITE} />);
    expect(
      screen.getByText(/Este site não está mais no painel\./),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver sites" }).getAttribute("href"),
    ).toBe("/servidor/sites");
  });
});
