"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/shared/formatters/dashboard";

export interface CalendarDay {
  /** "DD/MM" — mesma chave usada pelo gráfico. */
  day: string;
  /** "AAAA-MM-DD". */
  date: string;
  total: number;
}

export interface CalendarMonth {
  year: number;
  /** 0 = janeiro. */
  month: number;
}

interface YearCalendarProps {
  days: CalendarDay[];
  /** Datas atualmente exibidas no gráfico ("AAAA-MM-DD") — a data completa,
      porque o rótulo "DD/MM" se repete entre anos e colidiria. */
  selected: string[];
  onSelect: (days: string[]) => void;
  onReset: () => void;
  /** true enquanto o gráfico mostra o período padrão (nada escolhido à mão):
      o primeiro clique começa uma seleção nova em vez de somar aos 7 dias. */
  fresh?: boolean;
  /** Teto de dias por seleção, pra não gerar centenas de pilares. */
  maxRange?: number;
  /** Limites de navegação (mês em que a operação realmente rodou). Sem
      isso, os dias emprestados do mês vizinho pra fechar a última semana
      abririam uma página inteira de um mês sem nenhuma operação. */
  minMonth: CalendarMonth;
  maxMonth: CalendarMonth;
}

const MS_PER_DAY = 86_400_000;
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
/** Semana começando na segunda, como na referência. */
const WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

/** Tinta clara dos títulos e números de dia sobre o cartão escuro. */
const INK = "#f0f0f0";
/** Tinta escura reservada pro texto que fica em cima de pílulas claras. */
const PILL_INK = "#101112";
/** Cor de controle (setas, link). Controle é moldura, não meta: entra no
    branco do texto, como o resto da navegação. */
const ACCENT = "#f5f5f5";

/** Um degrau de cinza por semana do mês (1ª à 6ª linha). Aqui a cor sempre
    foi reforço — quem identifica a semana é a linha em que ela está —, e
    numa tela onde cor quer dizer meta, seis matizes de enfeite passariam
    seis recados falsos. */
const WEEK_COLORS = [
  "#f5f5f5",
  "#d4d4d4",
  "#b3b3b3",
  "#949494",
  "#7a7a7a",
  "#616161",
];

/** Cor do número dentro da pílula selecionada, escolhida por contraste:
    branco nas cores escuras, tinta escura nas claras (amarelo/laranja/verde). */
const WEEK_TEXT = [
  PILL_INK,
  PILL_INK,
  "#ffffff",
  PILL_INK,
  "#ffffff",
  PILL_INK,
];

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function toUTC(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoFrom(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const formatBRL = (value: number) => formatCurrency(value);

/** Calendário escuro estilo pílula: cada clique liga/desliga aquele dia no
    gráfico (dias vizinhos selecionados se fundem numa pílula na cor da
    semana), e o botão ✓ ao lado seleciona a semana inteira. */
export function YearCalendar({
  days,
  selected,
  onSelect,
  onReset,
  fresh = false,
  maxRange = 31,
  minMonth: minMonthProp,
  maxMonth: maxMonthProp,
}: YearCalendarProps) {
  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.date, d])),
    [days],
  );

  // Meses absolutos (ano*12 + mês) — os limites vêm de fora (meses com
  // operação de verdade), não dos extremos de `days`, que incluem alguns
  // dias emprestados do mês vizinho só pra fechar a última semana visual.
  const minMonth = minMonthProp.year * 12 + minMonthProp.month;
  const maxMonth = maxMonthProp.year * 12 + maxMonthProp.month;

  /** Mês visível, contado em "meses absolutos" (ano*12 + mês). Abre no mês
      de hoje (não no último mês navegável, que pode estar anos à frente),
      respeitando os limites. */
  const [viewMonth, setViewMonth] = React.useState(() => {
    const agora = new Date();
    const mesAtual = agora.getUTCFullYear() * 12 + agora.getUTCMonth();
    return Math.min(maxMonth, Math.max(minMonth, mesAtual));
  });

  const year = Math.floor(viewMonth / 12);
  const month = viewMonth % 12;

  /** Células do mês: toda semana tem os 7 dias completos — o começo e o fim
      são preenchidos com dias do mês anterior/seguinte quando preciso. */
  const cells = React.useMemo(() => {
    const firstOfMonth = Date.UTC(year, month, 1);
    const blanks = (new Date(firstOfMonth).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const list: string[] = [];
    for (let i = blanks; i > 0; i--) {
      list.push(isoFrom(firstOfMonth - i * MS_PER_DAY));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(isoFrom(Date.UTC(year, month, d)));
    }
    while (list.length % 7 !== 0) {
      list.push(isoFrom(toUTC(list[list.length - 1]) + MS_PER_DAY));
    }
    return list;
  }, [year, month]);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  function isSelected(date: string | null | undefined) {
    if (!date) return false;
    return byDate.has(date) && selectedSet.has(date);
  }

  /** Liga/desliga um dia. Com a seleção "padrão" na tela, o primeiro clique
      começa do zero, só com o dia clicado. */
  function handleClick(date: string) {
    if (!byDate.has(date)) return;

    if (fresh) {
      onSelect([date]);
      return;
    }

    const atual = new Set(selectedSet);
    if (atual.has(date)) atual.delete(date);
    else atual.add(date);

    if (atual.size === 0) {
      onReset();
      return;
    }

    // Reordena cronologicamente (a lista `days` já vem em ordem) e aplica o teto.
    const ordenados = days
      .filter((d) => atual.has(d.date))
      .slice(0, maxRange)
      .map((d) => d.date);
    onSelect(ordenados);
  }

  /** Datas com dados de uma linha do calendário ("AAAA-MM-DD"). */
  function diasDaLinha(week: string[]) {
    return week.filter((date) => byDate.has(date));
  }

  /** Botão ✓ da semana: mostra SÓ aquela semana (substitui qualquer seleção
      anterior — inclusive de outros meses); clicando de novo, desmarca ela
      e volta ao padrão. */
  function handleSelectWeek(week: string[]) {
    const picked = diasDaLinha(week);
    if (picked.length === 0) return;

    const semanaJaSelecionada = picked.every((d) => selectedSet.has(d));

    if (semanaJaSelecionada) {
      const restantes = days
        .filter((d) => selectedSet.has(d.date) && !picked.includes(d.date))
        .map((d) => d.date);
      if (restantes.length === 0) onReset();
      else onSelect(restantes);
      return;
    }

    onSelect(picked);
  }

  const excedeuTeto = selected.length >= maxRange;

  /** Linhas do mês: grupos de 7 células, uma moldura animada por semana. */
  const weekRows = React.useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  return (
    <div
      className="flex w-fit flex-col gap-3 rounded-2xl p-4"
      style={{
        background: "linear-gradient(145deg,#1c1d1e,#18191a)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 2px rgba(0,0,0,.4), 0 16px 32px -24px rgba(0,0,0,.7)",
      }}
    >
      <style>{`
        @property --wk-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        /* Moldura da semana: um anel fino onde uma luz na cor da semana
           circula a borda, mais um brilho neon suave ao redor. O miolo
           (.wk-inner) cobre o centro, deixando só o anel aparecer. */
        .wk-frame {
          position: relative;
          padding: 2px;
          border-radius: 22px;
          background:
            conic-gradient(
              from var(--wk-angle),
              transparent 0deg,
              transparent 290deg,
              var(--wk-color) 325deg,
              transparent 355deg
            ),
            linear-gradient(var(--wk-dim), var(--wk-dim));
          box-shadow: 0 0 10px var(--wk-glow), 0 0 22px var(--wk-glow-far);
          animation: wkSpin 4.5s linear infinite;
        }
        @keyframes wkSpin {
          to { --wk-angle: 360deg; }
        }
        .wk-inner {
          border-radius: 20px;
          background: #18191a;
        }
        @media (prefers-reduced-motion: reduce) {
          .wk-frame { animation: none; }
        }
      `}</style>
      {/* Mês à esquerda, setas juntas à direita — como na referência */}
      <div className="flex items-center justify-between gap-6">
        <p className="text-sm font-bold" style={{ color: INK }}>
          {MONTHS[month]} {year}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mês anterior"
            disabled={viewMonth <= minMonth}
            onClick={() => setViewMonth((m) => Math.max(m - 1, minMonth))}
            className="rounded-md p-1 disabled:opacity-30"
            style={{ color: ACCENT }}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            disabled={viewMonth >= maxMonth}
            onClick={() => setViewMonth((m) => Math.min(m + 1, maxMonth))}
            className="rounded-md p-1 disabled:opacity-30"
            style={{ color: ACCENT }}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className="w-10 text-center text-xs font-semibold tracking-wide"
            style={{ color: "var(--muted-foreground)" }}
          >
            {w}
          </span>
        ))}
      </div>

      {/* Dias do mês: uma moldura neon animada por semana, e dentro dela a
          linha de dias sem espaço horizontal (pra seleção virar pílula). */}
      <div className="flex flex-col gap-1.5">
        {weekRows.map((week, wi) => {
          const weekColor = WEEK_COLORS[wi % WEEK_COLORS.length];
          const weekText = WEEK_TEXT[wi % WEEK_TEXT.length];

          const diasComDados = diasDaLinha(week);
          const temDados = diasComDados.length > 0;
          const semanaSelecionada =
            temDados && diasComDados.every((d) => selectedSet.has(d));

          return (
            <div key={`week-${wi}`} className="flex items-center">
              <div
                className="wk-frame"
                style={
                  {
                    "--wk-color": weekColor,
                    "--wk-dim": hexToRgba(weekColor, 0.22),
                    "--wk-glow": hexToRgba(weekColor, 0.35),
                    "--wk-glow-far": hexToRgba(weekColor, 0.16),
                    animationDelay: `${wi * 0.7}s`,
                  } as React.CSSProperties
                }
              >
                <div className="wk-inner flex">
                  {week.map((date, ci) => {
                    const row = byDate.get(date);
                    const dayNumber = Number(date.slice(-2));
                    const selectedCell = isSelected(date);
                    // Dia "emprestado" do mês vizinho: aparece apagadinho.
                    const foraDoMes =
                      new Date(toUTC(date)).getUTCMonth() !== month;

                    const prev = ci === 0 ? null : week[ci - 1];
                    const next = ci === week.length - 1 ? null : week[ci + 1];

                    // Dias vizinhos selecionados se fundem: a pílula só
                    // arredonda onde o trecho selecionado começa ou termina.
                    const roundLeft = selectedCell && !isSelected(prev);
                    const roundRight = selectedCell && !isSelected(next);

                    return (
                      <button
                        key={date}
                        type="button"
                        disabled={!row}
                        title={
                          row
                            ? `${row.day} · ${formatBRL(row.total)}`
                            : undefined
                        }
                        onClick={() => handleClick(date)}
                        className={cn(
                          "flex h-9 w-10 items-center justify-center text-[12px] font-semibold tabular-nums transition-colors",
                          row && "cursor-pointer",
                          !row && "cursor-default opacity-30",
                        )}
                        style={{
                          background: selectedCell ? weekColor : "transparent",
                          color: selectedCell
                            ? weekText
                            : foraDoMes
                              ? "var(--muted-foreground)"
                              : INK,
                          borderRadius: `${roundLeft ? "18px" : "0"} ${roundRight ? "18px" : "0"} ${roundRight ? "18px" : "0"} ${roundLeft ? "18px" : "0"}`,
                        }}
                      >
                        {dayNumber}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botão da semana: seleciona a linha inteira de uma vez */}
              <button
                type="button"
                disabled={!temDados}
                aria-label={`Selecionar a semana ${wi + 1}`}
                title={
                  semanaSelecionada
                    ? "Desmarcar esta semana"
                    : "Selecionar esta semana inteira"
                }
                onClick={() => handleSelectWeek(week)}
                className="ml-2 flex size-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 disabled:opacity-30"
                style={{
                  background: semanaSelecionada
                    ? weekColor
                    : hexToRgba(weekColor, 0.14),
                  border: `1.5px solid ${weekColor}`,
                  color: semanaSelecionada ? weekText : weekColor,
                }}
              >
                <Check className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Rodapé: instrução + atalho de volta */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {fresh
            ? "Clique nos dias que você quer ver"
            : "Clique num dia pra adicionar ou tirar do gráfico"}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="text-xs underline underline-offset-2"
          style={{ color: ACCENT }}
        >
          Semana atual
        </button>
      </div>

      {excedeuTeto && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Mostrando os primeiros {maxRange} dias do período escolhido.
        </p>
      )}
    </div>
  );
}
