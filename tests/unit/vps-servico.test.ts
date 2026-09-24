// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { VpsError } from "@/features/vps/modelo";
import {
  COLUNAS_DA_RELEASE,
  COLUNAS_DA_TAREFA,
  COLUNAS_DO_DOMINIO,
  COLUNAS_DO_SERVIDOR,
  COLUNAS_DO_SITE,
} from "@/features/vps/queries";
import {
  calcularEsperaDoSsl,
  comandoDeInstalacao,
  ESPERA_SSL_MS,
  lerDominios,
  noArDaConferencia,
  respostaDeErroVps,
} from "@/features/vps/servico";

/*
  As partes puras de src/features/vps/servico.ts: a resposta de erro (o
  painel VPS anterior devolvia 503 "falta configuração" para QUALQUER erro),
  o comando de instalação, a espera do HTTPS, a leitura do "No ar" e a
  lista de domínios de um site.
*/

afterEach(() => vi.restoreAllMocks());

describe("respostaDeErroVps", () => {
  it("VpsError do painel: o próprio status, código e mensagem, sem cache", async () => {
    const r = respostaDeErroVps(
      new VpsError(409, "site_ocupado", "Espere a anterior.", {
        erros: { siteId: "x" },
      }),
    );
    expect(r.status).toBe(409);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({
      ok: false,
      codigo: "site_ocupado",
      error: "Espere a anterior.",
      erros: { siteId: "x" },
    });
  });

  it("erro desconhecido vira 500 erro_interno (nunca 503 de configuração) e vai para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const painel = respostaDeErroVps(new TypeError("x is undefined"));
    expect(painel.status).toBe(500);
    expect((await painel.json()).codigo).toBe("erro_interno");
    const agente = respostaDeErroVps(new Error("boom"), "agente");
    expect(agente.status).toBe(500);
    expect(await agente.json()).toEqual({ ok: false, error: "erro_interno" });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("tabela ausente (mesmo embrulhada pelo drizzle) vira 503 sem_tabelas / tables_missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const embrulhado = new Error("Failed query: select 1", {
      cause: Object.assign(new Error('relation "vps_jobs" does not exist'), {
        code: "42P01",
      }),
    });
    const painel = respostaDeErroVps(embrulhado);
    expect(painel.status).toBe(503);
    const corpo = await painel.json();
    expect(corpo.codigo).toBe("sem_tabelas");
    expect(corpo.error).toContain("0006_vps.sql");
    const agente = respostaDeErroVps(embrulhado, "agente");
    expect(await agente.json()).toEqual({ ok: false, error: "tables_missing" });
  });

  it("no agente: códigos do painel viram os do protocolo; 429 leva tenteEm e Retry-After", async () => {
    const semChave = respostaDeErroVps(
      new VpsError(503, "sem_chave", "configure"),
      "agente",
    );
    expect(semChave.status).toBe(503);
    expect(await semChave.json()).toEqual({
      ok: false,
      error: "not_configured",
    });

    const freio = respostaDeErroVps(
      new VpsError(429, "too_many_requests", "rápido", { tenteEm: 5 }),
      "agente",
    );
    expect(freio.status).toBe(429);
    expect(freio.headers.get("retry-after")).toBe("5");
    expect(await freio.json()).toEqual({
      ok: false,
      error: "too_many_requests",
      tenteEm: 5,
    });

    const limite = respostaDeErroVps(new VpsError(429, "limite", "calma"));
    expect(limite.headers.get("retry-after")).toBe("60");
  });
});

describe("comandoDeInstalacao", () => {
  const codigo = "A".repeat(43);
  const sha = "a".repeat(64);

  it("baixa com https, confere o sha256 e manda o código pelo stdin", () => {
    const comando = comandoDeInstalacao(
      "https://dash-board-psi-one.vercel.app",
      codigo,
      sha,
    );
    expect(comando).toBe(
      `T=$(mktemp -d) && curl -fsSL --proto '=https' --tlsv1.2 https://dash-board-psi-one.vercel.app/agente/v1/instalar.sh -o "$T/instalar.sh" && echo "${sha}  $T/instalar.sh" | sha256sum -c --quiet - && printf '%s\\n' '${codigo}' | if [ "$(id -u)" -eq 0 ]; then bash "$T/instalar.sh" --painel https://dash-board-psi-one.vercel.app; else sudo bash "$T/instalar.sh" --painel https://dash-board-psi-one.vercel.app; fi`,
    );
    // O código nunca vai no argv do sudo/bash.
    expect(comando.split("|").at(-1)).not.toContain(codigo);
  });

  it("recusa painel ou código que poderiam injetar shell", () => {
    expect(() =>
      comandoDeInstalacao("https://x.com;rm -rf /", codigo, sha),
    ).toThrow(VpsError);
    expect(() =>
      comandoDeInstalacao("https://x.com/caminho", codigo, sha),
    ).toThrow(VpsError);
    expect(() =>
      comandoDeInstalacao("https://x.com", "'; reboot; '", sha),
    ).toThrow(VpsError);
  });
});

describe("calcularEsperaDoSsl", () => {
  const agora = Date.parse("2026-09-23T12:00:00Z");
  const minutos = (n: number) => new Date(agora - n * 60_000);

  it("15 min depois de um `falhou`; `expirada` e `sem_resposta` não contam", () => {
    expect(calcularEsperaDoSsl([], agora)).toBeNull();
    expect(
      calcularEsperaDoSsl(
        [{ status: "falhou", createdAt: minutos(6), finishedAt: minutos(5) }],
        agora,
      ),
    ).toEqual(new Date(minutos(5).getTime() + ESPERA_SSL_MS));
    expect(
      calcularEsperaDoSsl(
        [
          { status: "expirada", createdAt: minutos(6), finishedAt: minutos(1) },
          { status: "sem_resposta", createdAt: minutos(5), finishedAt: null },
        ],
        agora,
      ),
    ).toBeNull();
    expect(
      calcularEsperaDoSsl(
        [{ status: "falhou", createdAt: minutos(30), finishedAt: minutos(20) }],
        agora,
      ),
    ).toBeNull();
  });

  it("no máximo 3 por hora: o 4º espera o mais velho da janela sair", () => {
    const pedidos = [50, 30, 10].map((n) => ({
      status: "concluida",
      createdAt: minutos(n),
      finishedAt: minutos(n - 1),
    }));
    expect(calcularEsperaDoSsl(pedidos, agora)).toEqual(
      new Date(minutos(50).getTime() + 3_600_000),
    );
  });
});

describe("noArDaConferencia", () => {
  it("sem conferência: não conferido; `ok` de outra versão não vale", () => {
    expect(noArDaConferencia({}, null)).toEqual({
      estado: "nao_conferido",
      url: null,
      em: null,
      detalhe: null,
    });
    const conferencia = {
      estado: "ok" as const,
      url: "https://loja.com/",
      em: "2026-09-23T21:12:00.000Z",
      versaoId: "v1",
    };
    expect(noArDaConferencia(conferencia, "v1").estado).toBe("ok");
    expect(noArDaConferencia(conferencia, "v2").estado).toBe("nao_conferido");
    expect(
      noArDaConferencia({ ...conferencia, estado: "pagina_de_espera" }, null)
        .estado,
    ).toBe("pagina_de_espera");
  });
});

describe("lerDominios", () => {
  const reservados = ["dash-board-psi-one.vercel.app", "checkout.loja.com"];

  it("normaliza, põe o principal primeiro e só aceita www pela opção", () => {
    expect(lerDominios("Loja.COM.br.", true, reservados)).toEqual([
      "loja.com.br",
      "www.loja.com.br",
    ]);
    expect(lerDominios("Promoção.com.BR", false, reservados)).toEqual([
      "xn--promoo-7ta5a.com.br",
    ]);
    expect(() => lerDominios("www.loja.com.br", false, reservados)).toThrow(
      /sem o www/,
    );
  });

  it("recusa vercel.app, o host do painel, IP, caminho e porta", () => {
    for (const ruim of [
      "loja.vercel.app",
      "dash-board-psi-one.vercel.app",
      "checkout.loja.com",
      "0x7f.1",
      "loja.com/pagina",
      "loja.com:8080",
      "https://loja.com",
      "localhost",
    ]) {
      let erro: unknown = null;
      try {
        lerDominios(ruim, false, reservados);
      } catch (e) {
        erro = e;
      }
      expect(erro, ruim).toMatchObject({
        status: 400,
        codigo: "dados_invalidos",
      });
    }
  });
});

describe("colunas públicas (padrão PUBLIC_COLUMNS)", () => {
  it("nenhuma consulta de DTO escolhe hash, params, assinatura ou conteúdo", () => {
    const nomes = [
      COLUNAS_DO_SERVIDOR,
      COLUNAS_DO_SITE,
      COLUNAS_DO_DOMINIO,
      COLUNAS_DA_RELEASE,
      COLUNAS_DA_TAREFA,
    ].flatMap((colunas) => Object.values(colunas).map((c) => c.name));
    expect(nomes.length).toBeGreaterThan(40);
    expect(
      nomes.filter((n) => /hash|params|signature|content/.test(n)),
    ).toEqual([]);
  });
});
