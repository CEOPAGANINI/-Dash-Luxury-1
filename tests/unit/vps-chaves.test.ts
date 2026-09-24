// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicoPedido,
  chaveMestra,
  chaveMestraOuErro,
  derivarChaves,
  hmacHex,
  iguais,
  iguaisTexto,
  mensagemTarefa,
  novoCodigoDeInstalacao,
  paraBase64Url,
  sha256hex,
} from "@/features/vps/chaves";
import { VpsError } from "@/features/vps/modelo";
import { montarParams } from "@/features/vps/protocolo";

/*
  Os vetores de tests/fixtures/vps/vetores-protocolo.json foram calculados
  por esta implementação e são conferidos também pelo unittest do agente.
  Se este teste falhar, o protocolo mudou: o agente em produção passaria a
  recusar tudo. Mude a versão (P_PEDIDO/P_TAREFA) em vez de "consertar" o
  arquivo.
*/

const vetores = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../fixtures/vps/vetores-protocolo.json"),
    "utf8",
  ),
) as {
  mestra: string;
  servidorId: string;
  geracao: number;
  chaves: { pedidos: string; tarefas: string };
  derivacao: { geracao: number; pedidos: string; tarefas: string }[];
  token: { valor: string; sha256: string };
  pedidos: {
    nome: string;
    metodo: string;
    caminho: string;
    seq: string;
    corpo: string;
    corpoBase64: string;
    corpoSha256: string;
    canonico: string;
    assinatura: string;
  }[];
  tarefas: {
    nome: string;
    valida: boolean;
    servidorId?: string;
    tarefa: {
      id: string;
      seq: number;
      tipo: string;
      params: string;
      expiraEm: number;
    };
    mensagem: string;
    assinatura: string;
  }[];
};

const mestra = Buffer.from(vetores.mestra, "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vetores do protocolo v1", () => {
  it("derivação por servidor e geração", () => {
    const chaves = derivarChaves(mestra, vetores.servidorId, vetores.geracao);
    expect(paraBase64Url(chaves.pedidos)).toBe(vetores.chaves.pedidos);
    expect(paraBase64Url(chaves.tarefas)).toBe(vetores.chaves.tarefas);
    for (const d of vetores.derivacao) {
      const c = derivarChaves(mestra, vetores.servidorId, d.geracao);
      expect([paraBase64Url(c.pedidos), paraBase64Url(c.tarefas)]).toEqual([
        d.pedidos,
        d.tarefas,
      ]);
    }
    // Girar a geração troca as duas chaves: é assim que se revoga.
    const g1 = derivarChaves(mestra, vetores.servidorId, 1);
    const g2 = derivarChaves(mestra, vetores.servidorId, 2);
    expect(g1.pedidos.equals(g2.pedidos)).toBe(false);
    expect(g1.tarefas.equals(g2.tarefas)).toBe(false);
    expect(g1.pedidos.equals(g1.tarefas)).toBe(false);
    expect(g1.pedidos.length).toBe(32);
  });

  it("sha256 do token", () => {
    expect(sha256hex(vetores.token.valor)).toBe(vetores.token.sha256);
  });

  it.each(vetores.pedidos)("pedido: $nome", (p) => {
    const corpo = Buffer.from(p.corpoBase64, "base64");
    expect(corpo.toString("utf8")).toBe(p.corpo);
    expect(sha256hex(corpo)).toBe(p.corpoSha256);
    const canonico = canonicoPedido(
      p.metodo,
      p.caminho,
      vetores.servidorId,
      p.seq,
      corpo,
    );
    expect(canonico).toBe(p.canonico);
    const { pedidos } = derivarChaves(
      mestra,
      vetores.servidorId,
      vetores.geracao,
    );
    expect(hmacHex(pedidos, canonico)).toBe(p.assinatura);
  });

  it.each(vetores.tarefas)("tarefa: $nome", (t) => {
    const mensagem = mensagemTarefa({
      servidorId: t.servidorId ?? vetores.servidorId,
      ...t.tarefa,
    });
    expect(mensagem).toBe(t.mensagem);
    const { tarefas } = derivarChaves(
      mestra,
      vetores.servidorId,
      vetores.geracao,
    );
    expect(iguaisTexto(hmacHex(tarefas, mensagem), t.assinatura)).toBe(
      t.valida,
    );
    if (t.valida) {
      // params é exatamente o que montarParams produz (ordem do schema).
      const tipo = t.tarefa.tipo as Parameters<typeof montarParams>[0];
      expect(montarParams(tipo, JSON.parse(t.tarefa.params))).toBe(
        t.tarefa.params,
      );
    }
  });
});

describe("chave mestra", () => {
  it("exige 32 caracteres ou mais, sem contar espaço nas pontas", () => {
    vi.stubEnv("VPS_CHAVE_MESTRA", "  curta  ");
    expect(chaveMestra()).toBeNull();
    expect(() => chaveMestraOuErro()).toThrow(VpsError);
    vi.stubEnv("VPS_CHAVE_MESTRA", ` ${"k".repeat(32)} `);
    expect(chaveMestra()?.toString()).toBe("k".repeat(32));
    vi.stubEnv("VPS_CHAVE_MESTRA", "");
    try {
      chaveMestraOuErro();
    } catch (e) {
      expect(e).toMatchObject({ status: 503, codigo: "sem_chave" });
    }
  });
});

describe("comparação e código de instalação", () => {
  it("iguais confere o tamanho antes (timingSafeEqual lançaria)", () => {
    expect(iguais(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
    expect(iguais(Buffer.from("abc"), Buffer.from("abcd"))).toBe(false);
    expect(iguaisTexto("a".repeat(64), "b".repeat(64))).toBe(false);
  });
  it("código de instalação: 43 caracteres base64url, sempre novo", () => {
    const a = novoCodigoDeInstalacao();
    const b = novoCodigoDeInstalacao();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});
