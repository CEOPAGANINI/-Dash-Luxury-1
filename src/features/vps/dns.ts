import { Resolver } from "node:dns/promises";

import type { DetalheDns, EstadoDns } from "./modelo";

/*
  Verificação de DNS dos domínios de um site (§9).

  O painel só CONSULTA o DNS; não conecta em nada. A tela diz "Na última
  verificação (hh:mm)…", nunca "propagado": o resultado vale para o
  resolvedor da Vercel naquele instante.

  O resolvedor é injetável para os testes; o padrão é um Resolver próprio
  (3 s, 2 tentativas), e cada consulta ainda tem um teto geral para a rota
  nunca passar do maxDuration.
*/

export type ResolvedorDns = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
};

export function resolvedorPadrao(): ResolvedorDns {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  return {
    resolve4: (hostname) => resolver.resolve4(hostname),
    resolve6: (hostname) => resolver.resolve6(hostname),
  };
}

/** O domínio não tem o registro pedido (não é falha da consulta). */
const SEM_REGISTRO = new Set(["ENOTFOUND", "ENODATA"]);

function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(
      () =>
        rejeitar(
          Object.assign(new Error("A consulta de DNS passou do tempo."), {
            code: "ETIMEOUT",
          }),
        ),
      ms,
    );
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promessa, teto]).finally(() => clearTimeout(timer));
}

function codigoDoErro(erro: unknown): string {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return typeof codigo === "string" ? codigo : "EDESCONHECIDO";
}

export type VerificacaoDns = {
  status: Exclude<EstadoDns, "nao_verificado">;
  detalhe: DetalheDns;
};

/**
 * Classifica um domínio contra os IPs esperados do servidor:
 * - `ok`: pelo menos um A, todos os A esperados, e AAAA vazio ou esperado;
 * - `outro_ip`: algum A de fora (lista os IPs vistos);
 * - `sem_registro`: nenhum A (ENOTFOUND/ENODATA);
 * - `aaaa_divergente`: A certo, mas um AAAA de fora (o Let's Encrypt usa IPv6);
 * - `erro_consulta`: timeout, SERVFAIL ou servidor sem IP público conhecido.
 */
export async function verificarDominio(
  hostname: string,
  esperados: { ipv4: string[]; ipv6: string[] },
  opcoes: { resolvedor?: ResolvedorDns; tetoMs?: number } = {},
): Promise<VerificacaoDns> {
  const resolvedor = opcoes.resolvedor ?? resolvedorPadrao();
  const tetoMs = opcoes.tetoMs ?? 7000;
  const esperadosV4 = [...new Set(esperados.ipv4)];
  const esperadosV6 = [
    ...new Set(esperados.ipv6.map((ip) => ip.toLowerCase())),
  ];
  const base = { esperadosV4, esperadosV6 };

  const [ra, raaaa] = await Promise.allSettled([
    comTeto(resolvedor.resolve4(hostname), tetoMs),
    comTeto(resolvedor.resolve6(hostname), tetoMs),
  ]);

  let a: string[] = [];
  if (ra.status === "fulfilled") a = ra.value;
  else if (!SEM_REGISTRO.has(codigoDoErro(ra.reason)))
    return {
      status: "erro_consulta",
      detalhe: {
        ...base,
        erro: codigoDoErro(ra.reason),
        mensagem: "A consulta de DNS falhou agora. Tente de novo em instantes.",
      },
    };
  let aaaa: string[] = [];
  if (raaaa.status === "fulfilled") aaaa = raaaa.value;
  else if (!SEM_REGISTRO.has(codigoDoErro(raaaa.reason)))
    return {
      status: "erro_consulta",
      detalhe: {
        ...base,
        a,
        erro: codigoDoErro(raaaa.reason),
        mensagem:
          "A consulta de DNS (IPv6) falhou agora. Tente de novo em instantes.",
      },
    };

  a = [...new Set(a)].sort();
  aaaa = [...new Set(aaaa.map((ip) => ip.toLowerCase()))].sort();
  const detalhe: DetalheDns = { ...base, a, aaaa, erro: null };

  if (esperadosV4.length === 0)
    return {
      status: "erro_consulta",
      detalhe: {
        ...detalhe,
        mensagem:
          "Sem IP público conhecido: informe o IP público da VPS (painel do provedor).",
      },
    };
  if (a.length === 0)
    return {
      status: "sem_registro",
      detalhe: {
        ...detalhe,
        mensagem: `Crie um registro A para ${hostname} apontando para ${esperadosV4[0]}.`,
      },
    };
  if (!a.every((ip) => esperadosV4.includes(ip)))
    return {
      status: "outro_ip",
      detalhe: {
        ...detalhe,
        mensagem: `O domínio aponta para ${a.join(", ")}, e não só para ${esperadosV4.join(", ")}. Cloudflare: deixe a nuvem cinza (somente DNS).`,
      },
    };
  if (aaaa.length > 0 && !aaaa.every((ip) => esperadosV6.includes(ip)))
    return {
      status: "aaaa_divergente",
      detalhe: {
        ...detalhe,
        mensagem: `Há um registro AAAA (${aaaa.join(", ")}) que não é desta VPS: apague o AAAA; o Let's Encrypt usa IPv6.`,
      },
    };
  return {
    status: "ok",
    detalhe: { ...detalhe, mensagem: "Aponta para este servidor." },
  };
}
