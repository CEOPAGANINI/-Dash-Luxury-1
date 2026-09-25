"use client";

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import type { ProfitGuardrails } from "@/features/guardrails/rules";
import { diagnosticar, type Achado, type Gravidade } from "./diagnostico";
import type { AdNetwork, CampaignRow } from "./types";

/*
  Os avisos das métricas do quadro, no desenho da linha do tempo do Lumen
  ("Immutable Audit Logs"): um fio vertical, um nó por aviso, o horário
  em mono, a campanha à direita e a gravidade num chip com texto.

  Nada aqui é inventado: os avisos são os achados do mesmo diagnóstico da
  calculadora (função pura sobre as métricas das campanhas), e o horário
  é o da última leitura da campanha. Sem leitura (demonstração), o
  horário diz isso em vez de fingir um.
*/

const ROTULO: Record<Gravidade, string> = {
  falha: "Falha",
  fraco: "Atenção",
  info: "Info",
  forte: "Bom",
};

const MAXIMO = 4;

function horario(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function AvisosDasMetricas({
  campanhas,
  regras,
  network,
}: {
  campanhas: readonly CampaignRow[];
  regras: ProfitGuardrails;
  network?: AdNetwork;
}) {
  const diagnostico = React.useMemo(
    () => diagnosticar([...campanhas], regras),
    [campanhas, regras],
  );
  const leituras = React.useMemo(
    () => new Map(campanhas.map((c) => [c.id, c.syncedAt ?? null])),
    [campanhas],
  );
  const ultimaLeitura = React.useMemo(() => {
    const tempos = campanhas
      .map((c) => (c.syncedAt ? new Date(c.syncedAt).getTime() : NaN))
      .filter((t) => !Number.isNaN(t));
    return tempos.length ? new Date(Math.max(...tempos)).toISOString() : null;
  }, [campanhas]);

  const avisos = diagnostico.achados.slice(0, MAXIMO);
  const restantes = diagnostico.achados.length - avisos.length;
  const destino = network ? `/campanhas/${network}/calculadora` : "/campanhas/calculadora";
  const quando = (a: Achado) =>
    horario(a.campanhaId ? leituras.get(a.campanhaId) : ultimaLeitura);

  return (
    <section className="class-board-avisos" aria-labelledby="class-board-avisos-titulo">
      <div className="class-board-avisos-texto">
        <h2 id="class-board-avisos-titulo">Avisos das métricas</h2>
        <p>
          O que os números das campanhas deste quadro estão dizendo agora: prejuízo, custo
          fora da curva e o que está indo bem, do mais grave para o melhor.
        </p>
      </div>

      {avisos.length === 0 ? (
        <p className="class-board-avisos-vazio">
          Nenhum aviso: ainda não há investimento suficiente para ler as campanhas.
        </p>
      ) : (
        <ol className="class-board-avisos-linha">
          {avisos.map((a, i) => {
            const hora = quando(a);
            return (
              <li key={a.id} className="class-board-aviso" data-gravidade={a.gravidade} data-ordem={i}>
                <div className="class-board-aviso-topo">
                  <span className="class-board-aviso-hora">
                    {hora ? `Leitura ${hora}` : "Demonstração"}
                  </span>
                  <span className="class-board-aviso-onde">{a.campanhaNome ?? "Quadro todo"}</span>
                </div>
                <div className="class-board-aviso-meio">
                  <span className="class-board-aviso-titulo">{a.titulo}</span>
                  <span className="class-board-aviso-chip">{ROTULO[a.gravidade]}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Link href={destino} className="class-board-avisos-pilula">
        <Lock aria-hidden="true" />
        <span>
          Diagnóstico completo
          {restantes > 0 ? ` · mais ${restantes} ${restantes === 1 ? "aviso" : "avisos"}` : ""}
        </span>
      </Link>
    </section>
  );
}
