"use client";

import * as React from "react";
import {
  accountToday,
  aggregateDays,
  classifyEfficiency,
  EFFICIENCY_TIERS,
  NO_EFFICIENCY_DATA,
  type AcquisitionDailyRecord,
} from "./acquisition-analytics";
import { calendarCells } from "./analytics";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatRatio,
} from "./formatters";
import type { NetworkId } from "./types";
import { DayDetailsPopover, type DayPreview } from "./day-details-popover";
import styles from "./acquisition-calendar.module.css";
import weekMotion from "./week-motion.module.css";

type AggregatedDay = ReturnType<typeof aggregateDays>[number];
type CalendarView = "month" | "week";

export interface AcquisitionCalendarProps {
  records: AcquisitionDailyRecord[];
  year: number;
  /** Zero-based month, following the existing dashboard provider. */
  month: number;
  day: number | null;
  onSelectDay: (day: number) => void;
  /** Preferred full-date callback; required to navigate adjacent-month days. */
  onSelectDate?: (date: string) => void;
  view: CalendarView;
  networkId: NetworkId;
  timeZone: string;
  roasTarget?: number | null;
  /** Account-local YYYY-MM-DD; injectable for deterministic validation. */
  today?: string;
  demoMode?: boolean;
}

const WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

function fullDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function money(value: number | null | undefined, compact = false) {
  return value == null || !Number.isFinite(value)
    ? "Sem dados"
    : compact
      ? formatCompactCurrency(value)
      : formatCurrency(value, 2);
}

function ratio(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "Sem dados"
    : formatRatio(value);
}

function dayStatus(
  item: AggregatedDay | undefined,
  date: string,
  today: string,
) {
  if (date > today) return "Futuro";
  if (
    !item ||
    item.recordCount === 0 ||
    [item.received, item.spend, item.orders].every((value) => value == null)
  )
    return "Sem dados";
  return item.partial ? "Parcial" : "Consolidado";
}

function dayEfficiency(
  item: AggregatedDay | undefined,
  date: string,
  today: string,
  target?: number | null,
) {
  return date > today
    ? { ...NO_EFFICIENCY_DATA, id: "futuro", label: "Futuro" }
    : classifyEfficiency({ roas: item?.roas ?? null }, target);
}

function dayDescription(
  item: AggregatedDay | undefined,
  date: string,
  today: string,
  target?: number | null,
) {
  const future = date > today;
  return `${fullDate(date)}. ${dayStatus(item, date, today)}. Receita: ${future ? "não disponível" : money(item?.received)}. Investimento: ${future ? "não disponível" : money(item?.spend)}. ROAS: ${future ? "não disponível" : ratio(item?.roas)}. ${dayEfficiency(item, date, today, target).label}.`;
}

function HourlySales({
  item,
  timeZone,
}: {
  item: AggregatedDay | undefined;
  timeZone: string;
}) {
  const orders = item?.hourlyOrders;
  const revenue = item?.hourly;
  const values =
    orders?.length === 24 ? orders : revenue?.length === 24 ? revenue : null;
  const metric = orders?.length === 24 ? "Vendas" : "Receita atribuída";
  const format =
    metric === "Vendas"
      ? formatInteger
      : (value: number) => formatCurrency(value, 2);
  const max = values ? Math.max(...values) : 0;
  const peakHours =
    values && max > 0
      ? values.flatMap((value, hour) => (value === max ? [hour] : []))
      : [];
  const peakLabel =
    peakHours.length > 3
      ? `Empate em ${peakHours.length} faixas; consulte os valores por hora.`
      : peakHours.map((hour) => `${hour}h–${hour + 1}h`).join(", ");
  return (
    <section className={styles.hourly} aria-label="Vendas por horário">
      <h4>Vendas por horário</h4>
      <p>
        {metric} · Fuso: {timeZone}
      </p>
      {values ? (
        <>
          <div
            className={styles.hourlyBars}
            role="img"
            aria-label={`${metric} por hora. ${peakHours.length ? `Maior concentração: ${peakLabel}.` : "Nenhuma venda registrada nas horas informadas."}`}
          >
            {values.map((value, hour) => (
              <div
                key={hour}
                className={styles.hourBar}
                title={`${hour}h–${hour + 1}h: ${format(value)}`}
              >
                <span
                  style={{ height: `${max > 0 ? (value / max) * 100 : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className={styles.axis} aria-hidden="true">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
          <p className={styles.peak}>
            {peakHours.length > 0
              ? `Maior concentração: ${peakLabel}`
              : "Nenhuma venda registrada nas horas informadas."}
          </p>
          <details className={styles.hourlyTable}>
            <summary>Consultar valores por hora</summary>
            <dl>
              {values.map((value, hour) => (
                <div key={hour}>
                  <dt>
                    {hour}h–{hour + 1}h
                  </dt>
                  <dd>{format(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      ) : (
        <p className={styles.empty}>
          Sem dados por horário. A integração precisa informar vendas ou receita
          por hora no fuso da conta.
        </p>
      )}
    </section>
  );
}

function DayDetails({
  item,
  date,
  today,
  timeZone,
  target,
}: {
  item: AggregatedDay | undefined;
  date: string;
  today: string;
  timeZone: string;
  target?: number | null;
}) {
  const future = date > today;
  const efficiency = dayEfficiency(item, date, today, target);
  const hasNewCustomers = item?.newCustomers != null;
  const campaignIds = [
    ...new Set(
      item?.records.flatMap((record) => record.campaignIds ?? []) ?? [],
    ),
  ];
  const rows = [
    ["Receita atribuída", money(item?.received)],
    ["Investimento em mídia", money(item?.spend)],
    ["Vendas", item?.orders == null ? "Sem dados" : formatInteger(item.orders)],
    ["ROAS", ratio(item?.roas)],
    [
      hasNewCustomers ? "CAC" : "CPA",
      money(hasNewCustomers ? item?.cac : item?.cpa),
    ],
  ];
  return (
    <div className={styles.detailContent}>
      <p className={styles.date}>{fullDate(date)}</p>
      <p className={styles.status}>
        {dayStatus(item, date, today)} · {efficiency.label}
      </p>
      {future ? (
        <p className={styles.empty}>
          Dia futuro. Resultados ainda não disponíveis.
        </p>
      ) : (
        <>
          <dl className={styles.metrics}>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {!hasNewCustomers ? (
            <p className={styles.note}>
              CPA = investimento ÷ vendas. CAC indisponível sem a quantidade de
              novos clientes.
            </p>
          ) : null}
          {item?.partial ? (
            <p className={styles.note}>
              Dados parciais: os valores podem mudar após a consolidação.
            </p>
          ) : null}
          <HourlySales item={item} timeZone={timeZone} />
          {campaignIds.length ? (
            <details className={styles.campaigns}>
              <summary>Campanhas deste dia ({campaignIds.length})</summary>
              <ul>
                {campaignIds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </details>
          ) : (
            <p className={styles.note}>
              Campanhas do dia não informadas pela integração.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function AcquisitionCalendar({
  records,
  year,
  month,
  day,
  onSelectDay,
  onSelectDate,
  view,
  networkId,
  timeZone,
  roasTarget,
  today: todayProp,
  demoMode = false,
}: AcquisitionCalendarProps) {
  const today = todayProp ?? accountToday(timeZone);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = React.useMemo(() => {
    const all = calendarCells(year, month);
    const lastIndex = all.findLastIndex((cell) => !cell.outside);
    return all.slice(0, Math.ceil((lastIndex + 1) / 7) * 7);
  }, [year, month]);
  const aggregated = React.useMemo(
    () =>
      aggregateDays(records, {
        networkId,
        start: cells[0]?.isoDate,
        end: cells.at(-1)?.isoDate,
        today,
      }),
    [records, networkId, cells, today],
  );
  const dayMap = React.useMemo(
    () => new Map(aggregated.map((item) => [item.date, item])),
    [aggregated],
  );
  const selectedDate =
    day != null && day >= 1 && day <= daysInMonth
      ? `${monthKey}-${String(day).padStart(2, "0")}`
      : null;
  const selectedWeek = Math.max(
    0,
    Math.floor(cells.findIndex((cell) => cell.isoDate === selectedDate) / 7),
  );
  const [weekState, setWeekState] = React.useState({
    month: monthKey,
    index: selectedWeek,
    direction: 0,
  });
  const week = weekState.month === monthKey ? weekState.index : selectedWeek;
  const [dayPreview, setDayPreview] = React.useState<DayPreview | null>(null);
  const previewContext = `${monthKey}-${view}-${week}-${networkId}`;
  const activePreview =
    dayPreview?.context === previewContext ? dayPreview : null;
  const [preview, setPreview] = React.useState<string | null>(null);
  const visiblePreview = preview?.startsWith(`${monthKey}-`)
    ? preview
    : selectedDate;
  const calendarRef = React.useRef<HTMLDivElement>(null);
  const lastTrigger = React.useRef<HTMLButtonElement | null>(null);
  const pendingDateFocus = React.useRef<string | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFocus = React.useRef(false);
  const wheelState = React.useRef({ total: 0, changedAt: 0 });
  const detailsId = React.useId();
  const keepPreviewOpen = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const closePreview = React.useCallback(
    (restoreFocus = false) => {
      keepPreviewOpen();
      setDayPreview(null);
      if (restoreFocus) {
        suppressFocus.current = true;
        lastTrigger.current?.focus({ preventScroll: true });
        suppressFocus.current = false;
      }
    },
    [keepPreviewOpen],
  );
  const scheduleClose = React.useCallback(() => {
    keepPreviewOpen();
    closeTimer.current = setTimeout(() => {
      if (
        document.activeElement !== lastTrigger.current &&
        !document.getElementById(detailsId)?.contains(document.activeElement)
      )
        setDayPreview(null);
    }, 160);
  }, [keepPreviewOpen, detailsId]);
  React.useEffect(() => () => keepPreviewOpen(), [keepPreviewOpen]);
  React.useLayoutEffect(() => {
    const date = pendingDateFocus.current;
    if (!date?.startsWith(`${monthKey}-`)) return;
    pendingDateFocus.current = null;
    calendarRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)
      ?.focus({ preventScroll: true });
  }, [monthKey]);
  const showPreview = (
    date: string,
    anchor: HTMLButtonElement,
    context = previewContext,
  ) => {
    // Once the preview is being inspected by keyboard/touch, incidental mouse
    // movement across the calendar must not replace the day being read.
    if (document.getElementById(detailsId)?.contains(document.activeElement))
      return;
    keepPreviewOpen();
    lastTrigger.current = anchor;
    setPreview(date);
    setDayPreview({ date, anchor, context });
  };
  const previewEvents = (date: string) => ({
    onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) =>
      showPreview(date, event.currentTarget),
    onMouseLeave: scheduleClose,
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (!suppressFocus.current) showPreview(date, event.currentTarget);
    },
    onBlur: (event: React.FocusEvent<HTMLButtonElement>) => {
      const panel = document.getElementById(detailsId);
      if (!panel?.contains(event.relatedTarget)) scheduleClose();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        activePreview?.date === date
      ) {
        const button = document
          .getElementById(detailsId)
          ?.querySelector<HTMLButtonElement>("button");
        if (button) {
          event.preventDefault();
          button.focus();
        }
      }
    },
  });
  const weekCount = cells.length / 7;
  const changeWeek = React.useCallback(
    (direction: number) => {
      closePreview();
      setWeekState((current) => ({
        month: monthKey,
        index: Math.min(
          weekCount - 1,
          Math.max(
            0,
            (current.month === monthKey ? current.index : selectedWeek) +
              direction,
          ),
        ),
        direction,
      }));
    },
    [monthKey, selectedWeek, weekCount, closePreview],
  );

  React.useEffect(() => {
    const container = calendarRef.current;
    if (!container || view !== "week") return;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - wheelState.current.changedAt < 400) return;
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      if (Math.sign(delta) !== Math.sign(wheelState.current.total))
        wheelState.current.total = 0;
      wheelState.current.total += delta;
      if (Math.abs(wheelState.current.total) < 60) return;
      changeWeek(Math.sign(wheelState.current.total));
      wheelState.current = { total: 0, changedAt: now };
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [view, changeWeek]);

  const selectDate = (date: string, trigger: HTMLButtonElement) => {
    const focusPreview = () => {
      requestAnimationFrame(() => {
        document
          .getElementById(detailsId)
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus({ preventScroll: true });
      });
    };
    const outsideMonth = !date.startsWith(`${monthKey}-`);
    if (outsideMonth) {
      if (onSelectDate) {
        closePreview();
        pendingDateFocus.current = date;
        onSelectDate(date);
      } else {
        // Preview remains available, but never select day N in the wrong month.
        showPreview(date, trigger);
      }
      focusPreview();
      return;
    }
    const selectedDay = Number(date.slice(-2));
    const index = Math.max(
      0,
      Math.floor(cells.findIndex((cell) => cell.isoDate === date) / 7),
    );
    if (onSelectDate) onSelectDate(date);
    else onSelectDay(selectedDay);
    showPreview(date, trigger, `${monthKey}-${view}-${index}-${networkId}`);
    setWeekState({
      month: monthKey,
      index,
      direction: 0,
    });
    focusPreview();
  };
  const efficiencyDays = cells.filter((cell) => !cell.outside);
  const classifications = [...EFFICIENCY_TIERS, NO_EFFICIENCY_DATA];
  const counts = new Map<string, number>();
  for (const cell of efficiencyDays) {
    const key = dayEfficiency(
      dayMap.get(cell.isoDate),
      cell.isoDate,
      today,
      roasTarget,
    ).id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <section
      className={styles.root}
      aria-label="Calendário e eficiência da aquisição"
    >
      <div className={styles.layout}>
        <div className={styles.calendarColumn}>
          <section
            className={styles.calendar}
            aria-label="Calendário de aquisição"
          >
            <div className={styles.calendarHeading}>
              <h2>
                {new Intl.DateTimeFormat("pt-BR", {
                  month: "long",
                  year: "numeric",
                }).format(new Date(year, month, 1))}
              </h2>
              <span>
                {demoMode ? "Dados de exemplo · Período simulado · " : ""}
                {view === "month"
                  ? "Visão mensal"
                  : `Semana ${week + 1} de ${weekCount}`}
              </span>
            </div>
            {view === "week" ? (
              <div className={styles.weekControls}>
                <button
                  type="button"
                  disabled={week === 0}
                  onClick={() => changeWeek(-1)}
                >
                  Semana anterior
                </button>
                <p>Role sobre os dias ou use Page Up / Page Down.</p>
                <button
                  type="button"
                  disabled={week === weekCount - 1}
                  onClick={() => changeWeek(1)}
                >
                  Próxima semana
                </button>
              </div>
            ) : null}
            <div
              ref={calendarRef}
              className={styles.gridFrame}
              data-view={view}
              onKeyDown={(event) => {
                if (
                  view === "week" &&
                  (event.key === "PageDown" || event.key === "PageUp")
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  changeWeek(event.key === "PageDown" ? 1 : -1);
                }
              }}
            >
              <div className={styles.weekdays} aria-hidden="true">
                {WEEKDAYS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className={weekMotion.frame}>
                <div
                  key={`${monthKey}-${view}-${view === "week" ? week : 0}`}
                  className={`${styles.days} ${view === "week" ? weekMotion.days : ""}`}
                  data-view={view}
                  data-direction={view === "week" ? weekState.direction : 0}
                >
                  {(view === "week"
                    ? cells.slice(week * 7, week * 7 + 7)
                    : cells
                  ).map((cell) => {
                    const item = dayMap.get(cell.isoDate);
                    const state = dayStatus(item, cell.isoDate, today);
                    const efficiency = dayEfficiency(
                      item,
                      cell.isoDate,
                      today,
                      roasTarget,
                    );
                    const selected = cell.isoDate === selectedDate;
                    return (
                      <button
                        key={cell.isoDate}
                        type="button"
                        className={styles.day}
                        data-date={cell.isoDate}
                        data-outside={cell.outside}
                        data-status={state}
                        data-selected={selected}
                        aria-label={dayDescription(
                          item,
                          cell.isoDate,
                          today,
                          roasTarget,
                        )}
                        aria-pressed={selected}
                        aria-haspopup="dialog"
                        aria-controls={
                          activePreview?.date === cell.isoDate
                            ? detailsId
                            : undefined
                        }
                        aria-expanded={activePreview?.date === cell.isoDate}
                        {...previewEvents(cell.isoDate)}
                        onClick={(event) =>
                          selectDate(cell.isoDate, event.currentTarget)
                        }
                        style={
                          {
                            "--efficiency": efficiency.color,
                          } as React.CSSProperties
                        }
                      >
                        <span className={styles.dayTop}>
                          <strong>
                            <span className={styles.mobileWeekday}>
                              {WEEKDAYS[(cell.date.getDay() + 6) % 7]}{" "}
                            </span>
                            {cell.day}
                            {cell.outside ? (
                              <span className={styles.adjacentMonth}>
                                {" "}
                                {new Intl.DateTimeFormat("pt-BR", {
                                  month: "short",
                                })
                                  .format(cell.date)
                                  .replace(/\.$/, "")}
                              </span>
                            ) : null}
                          </strong>
                          <span className={styles.dayState}>{state}</span>
                        </span>
                        <span className={styles.revenue}>
                          {state === "Futuro" || item?.received == null
                            ? "—"
                            : money(item?.received, true)}
                        </span>
                        <span className={styles.roas}>
                          {state === "Futuro"
                            ? ""
                            : `ROAS ${item?.roas == null ? "—" : ratio(item.roas)}`}
                        </span>
                        <span className={styles.efficiencyLabel}>
                          {state === "Futuro" || item?.roas == null
                            ? ""
                            : efficiency.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section
            className={styles.efficiency}
            aria-label="Barra de eficiência dos dias"
          >
            <div className={styles.efficiencyHeading}>
              <h3>Eficiência dos dias</h3>
              <p>
                ROAS ·{" "}
                {roasTarget != null && roasTarget > 0
                  ? `Meta configurada: ${formatRatio(roasTarget)}`
                  : "Meta não configurada"}
              </p>
            </div>
            <div
              className={styles.strip}
              role="group"
              aria-label="Selecionar dia pela eficiência"
            >
              {efficiencyDays.map((cell) => {
                const item = dayMap.get(cell.isoDate);
                const classification = dayEfficiency(
                  item,
                  cell.isoDate,
                  today,
                  roasTarget,
                );
                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    data-date={cell.isoDate}
                    data-selected={cell.isoDate === selectedDate}
                    aria-pressed={cell.isoDate === selectedDate}
                    aria-haspopup="dialog"
                    aria-controls={
                      activePreview?.date === cell.isoDate
                        ? detailsId
                        : undefined
                    }
                    aria-expanded={activePreview?.date === cell.isoDate}
                    aria-label={dayDescription(
                      item,
                      cell.isoDate,
                      today,
                      roasTarget,
                    )}
                    onClick={(event) =>
                      selectDate(cell.isoDate, event.currentTarget)
                    }
                    {...previewEvents(cell.isoDate)}
                    style={
                      {
                        "--efficiency": classification.color,
                      } as React.CSSProperties
                    }
                  >
                    <span>{cell.day}</span>
                    <span className={styles.srOnly}>
                      {classification.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={styles.stripPreview} aria-live="polite">
              {visiblePreview
                ? dayDescription(
                    dayMap.get(visiblePreview),
                    visiblePreview,
                    today,
                    roasTarget,
                  )
                : "Passe o mouse sobre um dia para ver os detalhes. No celular, toque no dia."}
            </p>
            <div className={styles.legend} aria-label="Legenda de eficiência">
              {classifications.map((classification) => (
                <span key={classification.id}>
                  <i
                    style={{ backgroundColor: classification.color }}
                    aria-hidden="true"
                  />
                  {classification.label}
                  <strong>{counts.get(classification.id) ?? 0} dias</strong>
                </span>
              ))}
              <span>
                <i style={{ backgroundColor: "#737373" }} aria-hidden="true" />
                Futuros<strong>{counts.get("futuro") ?? 0} dias</strong>
              </span>
            </div>
            <details className={styles.rules}>
              <summary>Como a eficiência é classificada?</summary>
              <p>
                Faixas de ROAS preservadas, sem sobreposição: abaixo de 1,00x;
                de 1,00x a menos de 1,15x; de 1,15x a menos de 1,40x; de 1,40x a
                menos de 1,80x; e 1,80x ou mais. Receita atribuída ÷
                investimento em mídia. Isso não mede lucro nem equilíbrio
                financeiro. Sem investimento ou receita disponíveis, o ROAS é
                “Sem dados”. Dias futuros não recebem nota de desempenho.
              </p>
            </details>
          </section>
        </div>
      </div>
      {activePreview ? (
        <DayDetailsPopover
          preview={activePreview}
          id={detailsId}
          onClose={closePreview}
          onKeepOpen={keepPreviewOpen}
          onLeave={scheduleClose}
        >
          <DayDetails
            item={dayMap.get(activePreview.date)}
            date={activePreview.date}
            today={today}
            timeZone={timeZone}
            target={roasTarget}
          />
        </DayDetailsPopover>
      ) : null}
    </section>
  );
}
