import * as React from "react";

import { Barra, Rosca, type Tom } from "@/features/design/medidas";
import { cn } from "@/lib/utils";

import {
  formatarBytes,
  formatarDataHora,
  formatarHora,
  formatarTempoAtivo,
  porcentagem,
  type LeituraDTO,
  type MedidaDTO,
  type ServidorDTO,
} from "./modelo";

/*
  Saúde do servidor: disco, memória e CPU nas formas do Capital Overview
  (src/features/design/medidas.tsx), sempre COM `total`. Sem o total, uma
  fatia sozinha vira o todo e 3 GB de 40 GB encheriam a rosca inteira.

  Regras de honestidade:
  - cada medida só é desenhada com valor; sem valor, "—" (nunca
    "Saudável" nem "Crítico" inventados);
  - a cor de alerta (atenção acima de 75% no disco e 80% na memória,
    negativo acima de 90%) só vale para leitura de até 10 min. Leitura
    velha fica sem cor e diz de quando é: pintar de verde um disco lido
    ontem seria afirmar o que ninguém sabe;
  - a hora é a da GRAVAÇÃO no painel (last_overview_at), e não a do parse;
  - não há gráfico de linha: não existe histórico, só a última leitura.

  Sem "use client": a mesma peça serve à página e às ilhas.
*/

/** Leitura com até 10 min: só ela ganha cor de alerta. */
export const LEITURA_FRESCA_MS = 10 * 60_000;

function tomDaMedida(
  pct: number,
  atencaoAcimaDe: number,
  fresca: boolean,
): Tom | undefined {
  if (!fresca) return undefined;
  if (pct > 90) return "negativo";
  if (pct > atencaoAcimaDe) return "atencao";
  return undefined;
}

function medidaValida(m: MedidaDTO | null): m is MedidaDTO {
  return (
    m !== null &&
    Number.isFinite(m.usadoBytes) &&
    Number.isFinite(m.totalBytes) &&
    m.totalBytes > 0 &&
    m.usadoBytes >= 0
  );
}

/** "21:10", ou "22/09 21:10" quando a hora sozinha seria ambígua. */
function quando(iso: string, agora: string): string {
  const passado = Date.parse(agora) - Date.parse(iso);
  return Number.isFinite(passado) && passado < 20 * 3_600_000
    ? formatarHora(iso)
    : formatarDataHora(iso);
}

function SemValor({ nome }: { nome: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-sm">{nome}</p>
      <p className="text-2xl font-semibold" aria-label={`${nome}: sem leitura`}>
        —
      </p>
    </div>
  );
}

export function MedidasDoServidor({
  leitura,
  erroLeitura,
  sinal,
  agora,
  compacto = false,
  acao,
}: {
  leitura: LeituraDTO | null;
  erroLeitura: string | null;
  sinal: ServidorDTO["sinal"];
  /** `agora` do estado (relógio do painel), para medir a idade da leitura. */
  agora: string;
  /** Cartão da lista: rosca menor e sem legenda. */
  compacto?: boolean;
  /** O botão "Ler agora" (vem da ilha, que tem a action). */
  acao?: React.ReactNode;
}) {
  const idade = leitura ? Date.parse(agora) - Date.parse(leitura.em) : NaN;
  const fresca = Number.isFinite(idade) && idade <= LEITURA_FRESCA_MS;

  const disco = leitura && medidaValida(leitura.disco) ? leitura.disco : null;
  const memoria =
    leitura && medidaValida(leitura.memoria) ? leitura.memoria : null;
  const cpu =
    leitura &&
    leitura.cpuPercent !== null &&
    Number.isFinite(leitura.cpuPercent)
      ? Math.min(100, Math.max(0, leitura.cpuPercent))
      : null;

  const pctDisco = disco ? porcentagem(disco.usadoBytes, disco.totalBytes) : 0;
  const pctMemoria = memoria
    ? porcentagem(memoria.usadoBytes, memoria.totalBytes)
    : 0;
  const cpuTexto =
    cpu === null
      ? "—"
      : `${cpu.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <div className="min-w-0 space-y-4">
      <div
        className={cn(
          "grid min-w-0 gap-4",
          compacto ? "grid-cols-1" : "sm:grid-cols-3",
        )}
      >
        {disco ? (
          <div className="min-w-0">
            <p className="text-muted-foreground mb-2 text-sm">Disco /</p>
            <Rosca
              nome="Disco /"
              centro={`${pctDisco.toLocaleString("pt-BR")}%`}
              nota={`de ${formatarBytes(disco.totalBytes)}`}
              total={disco.totalBytes}
              tamanho={compacto ? 88 : undefined}
              legenda={!compacto}
              fatias={[
                {
                  chave: "usado",
                  nome: "Usado",
                  valor: disco.usadoBytes,
                  texto: formatarBytes(disco.usadoBytes),
                  tom: tomDaMedida(pctDisco, 75, fresca),
                },
              ]}
            />
          </div>
        ) : (
          <SemValor nome="Disco /" />
        )}
        {memoria ? (
          <Barra
            nome="Memória"
            destaque={formatarBytes(memoria.usadoBytes)}
            total={memoria.totalBytes}
            legenda={!compacto}
            fatias={[
              {
                chave: "usada",
                nome: `Usada de ${formatarBytes(memoria.totalBytes)}`,
                valor: memoria.usadoBytes,
                texto: formatarBytes(memoria.usadoBytes),
                tom: tomDaMedida(pctMemoria, 80, fresca),
              },
            ]}
          />
        ) : (
          <SemValor nome="Memória" />
        )}
        {cpu !== null ? (
          <Barra
            nome="CPU (amostra de 1 s)"
            destaque={cpuTexto}
            total={100}
            legenda={!compacto}
            fatias={[
              { chave: "uso", nome: "Uso", valor: cpu, texto: cpuTexto },
            ]}
          />
        ) : (
          <SemValor nome="CPU (amostra de 1 s)" />
        )}
      </div>

      {!compacto && (
        <dl className="grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Última leitura</dt>
            <dd>{leitura ? formatarDataHora(leitura.em) : "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Tempo ativo</dt>
            <dd>{formatarTempoAtivo(leitura?.uptimeSegundos ?? null)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Núcleos</dt>
            <dd>{leitura?.cpuCores ?? "—"}</dd>
          </div>
        </dl>
      )}

      {compacto && leitura && (
        <p className="text-muted-foreground text-xs">
          Última leitura: {quando(leitura.em, agora)}
        </p>
      )}

      {!leitura && (
        <p className="text-muted-foreground text-sm">
          O agente ainda não mandou nenhuma leitura deste servidor.
        </p>
      )}

      {leitura && !fresca && (
        <p className="text-muted-foreground text-sm">
          {sinal.tipo !== "online" && sinal.ultimoPulsoEm
            ? `Sem sinal desde ${quando(sinal.ultimoPulsoEm, agora)}: valores da última leitura.`
            : `Leitura de ${quando(leitura.em, agora)}: valores antigos, sem cor de alerta.`}
        </p>
      )}

      {erroLeitura && (
        <p className="text-warning text-sm break-words">
          A última leitura não pôde ser lida: {erroLeitura}
        </p>
      )}

      {!compacto && leitura && leitura.avisos.length > 0 && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs leading-5">
          {leitura.avisos.map((aviso) => (
            <li key={aviso} className="break-words">
              {aviso}
            </li>
          ))}
        </ul>
      )}

      {acao}
    </div>
  );
}
