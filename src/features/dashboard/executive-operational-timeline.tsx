"use client";

import type { DemoRevenueDay } from "@/lib/demo-data";
import { OperationsRevenueCalendar } from "@/features/dashboard/operations-revenue-calendar";
import { RevenueChart } from "@/features/dashboard/revenue-chart";

interface ExecutiveOperationalTimelineProps {
  days: DemoRevenueDay[];
  fallbackWeek: DemoRevenueDay[];
  analysisDates: string[] | null;
  selectedDates: string[] | null;
  onSelectedDatesChange: (dates: string[] | null) => void;
  minMonth: { year: number; month: number };
  maxMonth: { year: number; month: number };
  dailyGoal: number;
  hourlyByDay: Record<string, { hour: string; valor: number }[]>;
}

/**
 * Em que horas do dia as vendas acontecem, no período escolhido. Só isso:
 * o resultado em dinheiro fica na Visão Executiva, a composição do caixa
 * no Financeiro, as perdas por etapa no Funil e a recompra em Clientes.
 */
export function ExecutiveOperationalTimeline(
  props: ExecutiveOperationalTimelineProps,
) {
  return (
    <RevenueChart
      data={props.fallbackWeek}
      goal={props.dailyGoal}
      hourlyByDay={props.hourlyByDay}
      allDays={props.days}
      operationMinMonth={props.minMonth}
      operationMaxMonth={props.maxMonth}
      selectedDates={props.analysisDates}
      onSelectedDatesChange={props.onSelectedDatesChange}
      showCalendar={false}
    />
  );
}

/**
 * O calendário do mês, sozinho: é com ele que se escolhe o dia ou a
 * semana. A escolha fica guardada e vale nas demais áreas.
 */
export function ExecutiveCalendar(props: ExecutiveOperationalTimelineProps) {
  return (
    <OperationsRevenueCalendar
      days={props.days}
      selectedDates={props.selectedDates}
      onSelectedDatesChange={props.onSelectedDatesChange}
      minMonth={props.minMonth}
      maxMonth={props.maxMonth}
      dailyGoal={props.dailyGoal}
      hourlyByDay={props.hourlyByDay}
    />
  );
}
