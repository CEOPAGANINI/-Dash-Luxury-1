"use client";

import * as React from "react";

import { lucroDaCampanha } from "./fees-store";
import { formatCurrency, formatRatio } from "@/features/unified-dashboard/formatters";
import { derivadas, somarMetricas, type AdMetrics } from "./types";

/*
  A saúde de uma campanha (ou de um bloco) num semáforo de três bolinhas
  neon, num soquete fundo: só uma acende de cada vez.

  - verde (pulsando): lucro — o retorno menos a taxa do gateway menos o
    tráfego é positivo, fora da zona de empate;
  - laranja: empate (breakeven) — o lucro fica entre −5% e +5% do
    investimento; empate exato quase nunca acontece, por isso a zona;
  - vermelha: prejuízo — lucro abaixo da zona de empate;
  - nenhuma: sem investimento (nada a dizer; apagado nunca quer dizer
    "está tudo bem").
*/
export type SaudeDaCampanha = "sem" | "prejuizo" | "empate" | "lucro";

/** A zona de empate: até esta fração do investimento, para cima ou para baixo. */
export const TOLERANCIA_EMPATE = 0.05;

export const ROTULO_DA_SAUDE: Record<SaudeDaCampanha, string> = {
  sem: "sem investimento",
  prejuizo: "prejuízo",
  empate: "empate",
  lucro: "lucro",
};

export const BOLINHAS = ["vermelha", "laranja", "verde"] as const;
export type Bolinha = (typeof BOLINHAS)[number];
export const BOLINHA_DA_SAUDE: Record<Exclude<SaudeDaCampanha, "sem">, Bolinha> = {
  prejuizo: "vermelha",
  empate: "laranja",
  lucro: "verde",
};

export function saudeDasMetricas(m: AdMetrics, gatewayPercentual: number): SaudeDaCampanha {
  if (m.spendCents <= 0) return "sem";
  const { lucroCents } = lucroDaCampanha(m, gatewayPercentual);
  const zona = Math.round(m.spendCents * TOLERANCIA_EMPATE);
  if (Math.abs(lucroCents) <= zona) return "empate";
  return lucroCents > 0 ? "lucro" : "prejuizo";
}

/** A saúde da soma de várias campanhas (um bloco). */
export function saudeDoConjunto(metricas: readonly AdMetrics[], gatewayPercentual: number): SaudeDaCampanha {
  return saudeDasMetricas(somarMetricas([...metricas]), gatewayPercentual);
}

/** O texto que acompanha o semáforo: estado, ROAS e lucro. */
export function descricaoDaSaude(m: AdMetrics, gatewayPercentual: number): string {
  const saude = saudeDasMetricas(m, gatewayPercentual);
  if (saude === "sem") return "Sem investimento: semáforo apagado.";
  const { lucroCents } = lucroDaCampanha(m, gatewayPercentual);
  const roas = derivadas(m).roas;
  const lucro = lucroCents < 0 ? `−${formatCurrency(-lucroCents / 100)}` : formatCurrency(lucroCents / 100);
  return `${ROTULO_DA_SAUDE[saude][0].toUpperCase()}${ROTULO_DA_SAUDE[saude].slice(1)} · ROAS ${roas === null ? "—" : formatRatio(roas)} · lucro ${lucro} (retorno − gateway ${gatewayPercentual}% − tráfego)`;
}

/** O semáforo: três bolinhas num soquete; a da saúde acesa, as outras apagadas. */
export function Semaforo({ saude, rotulo, titulo, className }: { saude: SaudeDaCampanha; rotulo: string; titulo?: string; className?: string }) {
  const acesa = saude === "sem" ? null : BOLINHA_DA_SAUDE[saude];
  return (
    <span
      className={className ? `class-board-semaforo ${className}` : "class-board-semaforo"}
      role="img"
      aria-label={`${rotulo}: ${ROTULO_DA_SAUDE[saude]}`}
      title={titulo}
      data-saude={saude}
    >
      {BOLINHAS.map((cor) => (
        <i key={cor} aria-hidden="true" data-cor={cor} data-acesa={acesa === cor ? "true" : "false"} />
      ))}
    </span>
  );
}
