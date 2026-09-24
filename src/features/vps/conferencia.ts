import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";

import {
  isPublicIpv4,
  PAGINA_DE_ESPERA,
  type ConferenciaPublica,
} from "./modelo";

/*
  "No ar": o painel busca `/` do domínio principal pelo lado de fora e
  compara com o que publicou (§8.6).

  Sem SSRF: a conexão vai SEMPRE para o IPv4 público do servidor (o
  `lookup` é fixado nele e o IP passa por isPublicIpv4), nas portas 80 ou
  443. O nome só entra como Host e SNI, e o certificado é verificado. Não
  segue redirecionamento, pede `identity`, lê até 2 MB e desiste em 5 s.

  O `lookup` e a porta são injetáveis só para os testes (servidor local).
*/

export type AlvoDaConferencia = {
  dominio: string;
  ipv4: string | null;
  https: boolean;
  /** sha256 do index.html da versão ativa (null: nenhuma versão ativa). */
  indexSha256: string | null;
  versaoId?: string | null;
};

export type OpcoesDaConferencia = {
  porta?: number;
  lookup?: LookupFunction;
  timeoutMs?: number;
  limiteBytes?: number;
  /** CA extra (testes com certificado próprio). */
  ca?: string | Buffer;
};

const LIMITE_PADRAO = 2 * 1024 * 1024;
const PAGINA_DE_ESPERA_BYTES = Buffer.from(PAGINA_DE_ESPERA, "utf8");

/** Resolve qualquer nome para o IP fixo (com e sem `all`, como o Node pede). */
export function lookupFixo(ip: string): LookupFunction {
  return (_hostname, opcoes, callback) => {
    if (opcoes?.all) callback(null, [{ address: ip, family: 4 }]);
    else callback(null, ip, 4);
  };
}

function explicarErro(erro: unknown): string {
  const codigo = (erro as { code?: unknown } | null)?.code;
  switch (codigo) {
    case "ECONNREFUSED":
      return "A porta do servidor recusou a conexão (o nginx está ligado?).";
    case "ECONNRESET":
      return "O servidor fechou a conexão (o nginx não reconhece este domínio?).";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "O servidor não é alcançável pela internet agora.";
    case "CERT_HAS_EXPIRED":
      return "O certificado HTTPS do domínio venceu.";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "O certificado HTTPS não é deste domínio.";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
      return "O certificado HTTPS não é de uma autoridade reconhecida.";
    default:
      return `A conferência falhou (${typeof codigo === "string" ? codigo : "erro de rede"}).`;
  }
}

export function conferirPublico(
  alvo: AlvoDaConferencia,
  opcoes: OpcoesDaConferencia = {},
): Promise<ConferenciaPublica> {
  const url = `${alvo.https ? "https" : "http"}://${alvo.dominio}/`;
  const base = {
    url,
    em: new Date().toISOString(),
    versaoId: alvo.versaoId ?? null,
  };
  if (!alvo.ipv4 || !isPublicIpv4(alvo.ipv4))
    return Promise.resolve({
      ...base,
      estado: "erro",
      status: null,
      detalhe: "Sem IPv4 público conhecido do servidor para conferir.",
    });

  const timeoutMs = opcoes.timeoutMs ?? 5000;
  const limite = opcoes.limiteBytes ?? LIMITE_PADRAO;
  const lookup = opcoes.lookup ?? lookupFixo(alvo.ipv4);

  return new Promise((resolver) => {
    let terminou = false;
    const fim = (r: Omit<ConferenciaPublica, "url" | "em" | "versaoId">) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio);
      pedido.destroy();
      resolver({ ...base, ...r });
    };
    const modulo = alvo.https ? https : http;
    const pedido = modulo.request(
      {
        host: alvo.dominio,
        port: opcoes.porta ?? (alvo.https ? 443 : 80),
        method: "GET",
        path: "/",
        lookup,
        agent: false,
        timeout: timeoutMs,
        headers: {
          Host: alvo.dominio,
          Accept: "text/html,*/*",
          "Accept-Encoding": "identity",
          "User-Agent": "dash-painel-conferencia/1",
        },
        ...(alvo.https
          ? {
              servername: alvo.dominio,
              rejectUnauthorized: true,
              ca: opcoes.ca,
            }
          : {}),
      },
      (resposta) => {
        const status = resposta.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          const destino = resposta.headers.location ?? "outro endereço";
          fim({
            estado: "outra_coisa",
            status,
            detalhe: `Responde com redirecionamento (HTTP ${status}) para ${destino}.`,
          });
          return;
        }
        const partes: Buffer[] = [];
        let total = 0;
        resposta.on("data", (parte: Buffer) => {
          total += parte.length;
          if (total > limite) {
            fim({
              estado: "outra_coisa",
              status,
              detalhe:
                "Responde uma página maior que 2 MB, que não é a publicada.",
            });
            return;
          }
          partes.push(parte);
        });
        resposta.on("error", (erro) =>
          fim({ estado: "erro", status, detalhe: explicarErro(erro) }),
        );
        resposta.on("end", () => {
          const corpo = Buffer.concat(partes);
          if (status !== 200) {
            fim({
              estado: "outra_coisa",
              status,
              detalhe: `Responde HTTP ${status}.`,
            });
            return;
          }
          const sha = createHash("sha256").update(corpo).digest("hex");
          if (alvo.indexSha256 && sha === alvo.indexSha256)
            fim({ estado: "ok", status, detalhe: null });
          else if (corpo.equals(PAGINA_DE_ESPERA_BYTES))
            fim({
              estado: "pagina_de_espera",
              status,
              detalhe: "Mostra a página de espera.",
            });
          else
            fim({
              estado: "outra_coisa",
              status,
              detalhe:
                "Responde outro conteúdo (DNS apontando para outro lugar, CDN ou cache na frente?).",
            });
        });
      },
    );
    const relogio = setTimeout(
      () =>
        fim({
          estado: "erro",
          status: null,
          detalhe: `Sem resposta em ${Math.round(timeoutMs / 1000)} s.`,
        }),
      timeoutMs,
    );
    pedido.on("timeout", () =>
      fim({
        estado: "erro",
        status: null,
        detalhe: `Sem resposta em ${Math.round(timeoutMs / 1000)} s.`,
      }),
    );
    pedido.on("error", (erro) =>
      fim({ estado: "erro", status: null, detalhe: explicarErro(erro) }),
    );
    pedido.end();
  });
}
