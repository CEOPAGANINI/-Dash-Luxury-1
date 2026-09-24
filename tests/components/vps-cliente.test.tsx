import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServidorDTO, SiteDTO } from "@/features/vps/modelo";
import {
  copiarTexto,
  enviarZip,
  ErroDoPainel,
  lerEstado,
  MENSAGEM_SESSAO_EXPIRADA,
  problemaDoArquivo,
  request,
  rotuloDaVersao,
  rotuloDoDnsDoSite,
  rotuloDoNoAr,
  rotuloDoServidor,
  snippetDoRastreio,
  tempoDesde,
} from "@/features/vps/vps-cliente";

/*
  O lado do navegador das telas do Servidor: pedidos (sessão vencida é
  diferente de falha), validação do ZIP antes do envio e os textos de
  estado — em especial, que nada diz "No ar" sem a conferência pública.
*/

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const AGORA = "2026-09-23T21:12:00.000Z";

function resposta(
  corpo: unknown,
  init: { status?: number; redirected?: boolean; json?: boolean } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: init.redirected ?? false,
    json:
      init.json === false
        ? () => Promise.reject(new SyntaxError("Unexpected token <"))
        : () => Promise.resolve(corpo),
  } as unknown as Response;
}

describe("request()", () => {
  it("devolve o JSON quando o painel responde ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(resposta({ ok: true, valor: 1 })),
    );
    await expect(request("/api/painel/vps/estado")).resolves.toEqual({
      ok: true,
      valor: 1,
    });
  });

  it("redirect para o login é sessão vencida, não falha genérica", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(resposta(null, { redirected: true, json: false })),
    );
    const erro = await request("/x").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDoPainel);
    expect((erro as ErroDoPainel).tipo).toBe("sessao");
    expect((erro as ErroDoPainel).message).toBe(MENSAGEM_SESSAO_EXPIRADA);
  });

  it("401 também é sessão vencida", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          resposta({ ok: false, codigo: "modo_demo" }, { status: 401 }),
        ),
    );
    const erro = (await request("/x").catch((e: unknown) => e)) as ErroDoPainel;
    expect(erro.tipo).toBe("sessao");
  });

  it("HTML no lugar de JSON (página de erro) é falha, com frase própria", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(resposta(null, { status: 502, json: false })),
    );
    const erro = (await request("/x").catch((e: unknown) => e)) as ErroDoPainel;
    expect(erro.tipo).toBe("falha");
    expect(erro.message).toMatch(/falhou ao responder/);
  });

  it("rede caída é falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const erro = (await request("/x").catch((e: unknown) => e)) as ErroDoPainel;
    expect(erro.tipo).toBe("falha");
  });

  it("recusa do painel traz a frase e o código", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          resposta(
            { ok: false, codigo: "login_antigo", error: "Entre de novo." },
            { status: 403 },
          ),
        ),
    );
    const erro = (await request("/x").catch((e: unknown) => e)) as ErroDoPainel;
    expect(erro.tipo).toBe("recusado");
    expect(erro.codigo).toBe("login_antigo");
    expect(erro.message).toBe("Entre de novo.");
  });

  it("lerEstado manda os filtros como ?servidor= e ?site=, sem cache", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await lerEstado({});
    await lerEstado({ servidorId: "a", siteId: "b" });
    expect(fetch.mock.calls[0][0]).toBe("/api/painel/vps/estado");
    expect(fetch.mock.calls[1][0]).toBe(
      "/api/painel/vps/estado?servidor=a&site=b",
    );
    expect(fetch.mock.calls[1][1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
    });
  });
});

describe("enviarZip()", () => {
  const zip = new File([new Uint8Array([80, 75, 5, 6])], "site.zip", {
    type: "application/zip",
  });

  it("manda multipart com siteId e arquivo para a rota de publicar", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        resposta(
          { ok: true, versao: { id: "v" }, tarefa: { id: "t" }, avisos: ["a"] },
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const envio = await enviarZip("site-1", zip);
    expect(envio).toMatchObject({ ok: true, avisos: ["a"] });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/painel/vps/publicar");
    expect(init.method).toBe("POST");
    const corpo = init.body as FormData;
    expect(corpo.get("siteId")).toBe("site-1");
    expect((corpo.get("arquivo") as File).name).toBe("site.zip");
  });

  it("422 volta como lista de problemas (arquivo + motivo), sem lançar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        resposta(
          {
            ok: false,
            codigo: "zip_com_problemas",
            error: "O ZIP tem problemas",
            problemas: [
              {
                arquivo: "script.php",
                motivo: "tipo de arquivo não permitido",
              },
              { lixo: true },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    await expect(enviarZip("s", zip)).resolves.toEqual({
      ok: false,
      mensagem: "O ZIP tem problemas",
      codigo: "zip_com_problemas",
      problemas: [
        { arquivo: "script.php", motivo: "tipo de arquivo não permitido" },
      ],
    });
  });

  it("sessão vencida no upload sobe como erro (a tela oferece entrar de novo)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(resposta(null, { redirected: true, json: false })),
    );
    await expect(enviarZip("s", zip)).rejects.toMatchObject({ tipo: "sessao" });
  });
});

describe("problemaDoArquivo()", () => {
  it("recusa o que não é .zip, vazio ou acima de 3 MB", () => {
    expect(problemaDoArquivo(new File(["x"], "site.rar"))).toMatch(/\.zip/);
    expect(problemaDoArquivo(new File([], "site.zip"))).toMatch(/vazio/);
    const grande = new File(["x"], "site.zip");
    Object.defineProperty(grande, "size", { value: 3_000_001 });
    expect(problemaDoArquivo(grande)).toMatch(/limite é 3 MB/);
  });

  it("aceita um .zip de 3 MB exatos, com maiúscula na extensão", () => {
    const certo = new File(["x"], "SITE.ZIP");
    Object.defineProperty(certo, "size", { value: 3_000_000 });
    expect(problemaDoArquivo(certo)).toBeNull();
  });
});

function servidor(extra: Partial<ServidorDTO> = {}): ServidorDTO {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "VPS",
    estado: "ativo",
    sinal: { tipo: "online", ultimoPulsoEm: "2026-09-23T21:11:48.000Z" },
    instalacao: null,
    registro: null,
    ipDoDns: null,
    ipInformado: null,
    versaoAgente: null,
    travas: { pausado: false, somenteLeitura: false },
    geracaoChave: 1,
    relogio: null,
    nginx: null,
    leitura: null,
    erroLeitura: null,
    totalSites: 0,
    ...extra,
  };
}

describe("rotuloDoServidor()", () => {
  it("online diz há quanto tempo, medido pelo relógio do painel", () => {
    expect(rotuloDoServidor(servidor(), AGORA)).toEqual({
      texto: "Online · sinal há 12 s",
      tom: "success",
    });
  });

  it("sem sinal diz desde quando, em minutos", () => {
    expect(
      rotuloDoServidor(
        servidor({
          sinal: {
            tipo: "sem_sinal",
            ultimoPulsoEm: "2026-09-23T21:05:00.000Z",
          },
        }),
        AGORA,
      ).texto,
    ).toBe("Sem sinal há 7 min");
  });

  it("aguardando instalação mostra a validade no fuso de São Paulo", () => {
    expect(
      rotuloDoServidor(
        servidor({
          estado: "aguardando_agente",
          instalacao: { expiraEm: "2026-09-23T21:40:00.000Z" },
        }),
        AGORA,
      ).texto,
    ).toBe("Aguardando instalação (vale até 18:40)");
  });

  it("confirmar e revogado", () => {
    expect(
      rotuloDoServidor(servidor({ estado: "aguardando_confirmacao" }), AGORA)
        .texto,
    ).toBe("Confirme que é seu");
    expect(rotuloDoServidor(servidor({ estado: "revogado" }), AGORA)).toEqual({
      texto: "Revogado",
      tom: "destructive",
    });
  });

  it("tempoDesde passa de segundos a minutos, horas e dias", () => {
    expect(tempoDesde("2026-09-23T21:11:00.000Z", AGORA)).toBe("1 min");
    expect(tempoDesde("2026-09-23T18:12:00.000Z", AGORA)).toBe("3 h");
    expect(tempoDesde("2026-09-20T21:12:00.000Z", AGORA)).toBe("3 d");
    expect(tempoDesde(null, AGORA)).toBe("—");
  });
});

describe("rotuloDoNoAr()", () => {
  it("só a conferência ok diz No ar, sempre com a hora", () => {
    const base = { url: "https://loja.com.br/", detalhe: null };
    expect(
      rotuloDoNoAr({ ...base, estado: "ok", em: "2026-09-23T21:12:00.000Z" }),
    ).toEqual({ texto: "No ar (conferido 18:12)", tom: "success" });
    for (const estado of [
      "nao_conferido",
      "pagina_de_espera",
      "outra_coisa",
      "erro",
    ] as const)
      expect(
        rotuloDoNoAr({ ...base, estado, em: "2026-09-23T21:12:00.000Z" }).texto,
      ).not.toMatch(/^No ar/);
  });
});

describe("rotuloDaVersao()", () => {
  const versao = {
    id: "v1",
    arquivo: "site.zip",
    criadaEm: AGORA,
    por: "dono@loja.com.br",
    arquivos: 3,
    bytes: 100,
    bytesZip: 50,
    paginas: {},
    temRastreio: false,
    estado: "no_servidor" as const,
    ativa: true,
    ativadaEm: AGORA,
    erro: null,
    avisos: [],
  };

  it("'Ativa no servidor' só quando o agente confirma a mesma versão", () => {
    expect(rotuloDaVersao(versao, "v1")).toEqual({
      texto: "Ativa no servidor",
      tom: "success",
    });
    expect(rotuloDaVersao(versao, "vazio").texto).toBe(
      "Ativa (o servidor ainda não confirmou)",
    );
    expect(rotuloDaVersao({ ...versao, ativa: false }, "v1").texto).toBe(
      "Guardada no servidor",
    );
  });

  it("falhou traz o motivo", () => {
    expect(
      rotuloDaVersao(
        { ...versao, estado: "falhou", erro: "sha diferente" },
        null,
      ).texto,
    ).toBe("Falhou: sha diferente");
  });
});

describe("rotuloDoDnsDoSite()", () => {
  const dominio = (dns: SiteDTO["dominios"][number]["dns"]) => ({
    hostname: `${dns}.com.br`,
    principal: false,
    dns,
    verificadoEm: null,
    detalhe: {},
  });
  const site = (dominios: SiteDTO["dominios"]) => ({ dominios }) as SiteDTO;

  it("resume em certo, não verificado ou N de M", () => {
    expect(rotuloDoDnsDoSite(site([dominio("ok"), dominio("ok")])).texto).toBe(
      "Certo",
    );
    expect(rotuloDoDnsDoSite(site([dominio("nao_verificado")])).texto).toBe(
      "Não verificado",
    );
    expect(
      rotuloDoDnsDoSite(site([dominio("ok"), dominio("outro_ip")])).texto,
    ).toBe("1 de 2 certos");
  });
});

describe("snippetDoRastreio()", () => {
  it("leva o produto do checkout escolhido", () => {
    expect(snippetDoRastreio("https://painel.com.br/", "cadeira-x")).toBe(
      '<script src="https://painel.com.br/agente/v1/rastreio.js" data-produto="cadeira-x" defer></script>',
    );
  });

  it("sem produto, sai sem o atributo", () => {
    expect(snippetDoRastreio("https://painel.com.br", null)).toBe(
      '<script src="https://painel.com.br/agente/v1/rastreio.js" defer></script>',
    );
  });
});

describe("copiarTexto()", () => {
  it("usa a área de transferência quando ela existe", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copiarTexto("abc")).resolves.toBe("copiado");
    expect(writeText).toHaveBeenCalledWith("abc");
  });

  it("sem permissão, seleciona o texto do elemento (plano B)", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
    });
    const pre = document.createElement("pre");
    pre.textContent = "comando";
    document.body.append(pre);
    await expect(copiarTexto("comando", pre)).resolves.toBe("selecionado");
    expect(window.getSelection()?.toString()).toBe("comando");
    pre.remove();
  });
});
