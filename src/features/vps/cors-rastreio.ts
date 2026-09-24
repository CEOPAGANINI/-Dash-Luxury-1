import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { vpsSiteDomains, vpsSites } from "@/database/schema/vps";

import { hostValido } from "./modelo";
import { type BancoVps } from "./schema-sql";

/*
  Quem pode mandar rastreio de outro domínio para /api/public/track (§8.6).

  As páginas do funil que moram na VPS carregam /agente/v1/rastreio.js do
  painel, e o navegador do visitante manda os eventos direto para a
  Vercel (IP e país reais). Isso é um pedido entre origens: sem
  Access-Control-Allow-Origin o navegador descarta a resposta e enche o
  console do visitante de erro. Só ganham CORS os domínios de site da VPS
  com DNS conferido (`ok`) e site não removido — não é qualquer origem que
  consegue gravar visitas no painel.

  Cache de 60 s por instância: o rastreio é chamado a cada page_view e
  heartbeat, e os domínios mudam raramente. Um domínio novo leva até 60 s
  para ganhar CORS; um removido, até 60 s para perder.
*/

const VALIDADE_MS = 60_000;

let cache: { ate: number; hosts: Set<string> } | null = null;

/** Só para testes: esquece a lista guardada. */
export function zerarCacheDoRastreio(): void {
  cache = null;
}

/** Os hostnames de site com DNS ok (cache de 60 s). Falha = lista vazia. */
export async function hostsDoRastreio(
  opcoes: { db?: BancoVps; agora?: number } = {},
): Promise<Set<string>> {
  const agora = opcoes.agora ?? Date.now();
  if (cache && cache.ate > agora) return cache.hosts;
  let hosts = new Set<string>();
  if (opcoes.db || isDatabaseConfigured()) {
    try {
      const db = opcoes.db ?? getDb();
      const linhas = await db
        .select({ hostname: vpsSiteDomains.hostname })
        .from(vpsSiteDomains)
        .innerJoin(vpsSites, eq(vpsSites.id, vpsSiteDomains.siteId))
        .where(
          and(eq(vpsSiteDomains.dnsStatus, "ok"), isNull(vpsSites.deletedAt)),
        );
      hosts = new Set(linhas.map((l) => l.hostname));
    } catch (erro) {
      // Sem tabelas (painel sem VPS) ou banco fora: ninguém de fora ganha
      // CORS. O rastreio do próprio app não depende disto.
      console.error("[rastreio] lista de domínios da VPS indisponível", erro);
    }
  }
  cache = { ate: agora + VALIDADE_MS, hosts };
  return hosts;
}

/**
 * A origem, normalizada, se ela é de um site da VPS com DNS ok; senão
 * null. Só `http(s)://host` (sem porta nem caminho: o nginx da VPS serve
 * 80 e 443).
 */
export async function origemPermitidaNoRastreio(
  origem: string | null,
  opcoes: { db?: BancoVps; agora?: number } = {},
): Promise<string | null> {
  if (!origem) return null;
  const partes = /^(https?):\/\/([A-Za-z0-9.-]{1,253})$/.exec(origem);
  if (!partes) return null;
  const host = partes[2].toLowerCase();
  if (!hostValido(host)) return null;
  const hosts = await hostsDoRastreio(opcoes);
  return hosts.has(host) ? `${partes[1]}://${host}` : null;
}
