"use client";

import type { ReactNode } from "react";

import {
  demoDailyRevenueGoal,
  demoOperationMaxMonth,
  demoOperationMinMonth,
  demoProfitSummary,
  demoRevenueByDayHour,
  demoRevenueByYear,
  demoRevenueCurrentWeek,
} from "@/lib/demo-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiGrid } from "@/features/dashboard/kpi-grid";
import {
  ExecutiveOverview,
  type ExecutiveSectionKey,
} from "@/features/dashboard/executive-overview";
import { VisualOverview } from "@/features/dashboard/visual-overview";
import { AcquisitionDemoBoard } from "@/features/unified-dashboard/acquisition-demo-board";
import { ConnectionsChecklist } from "@/features/dashboard/connections-checklist";

/**
 * Registro central dos blocos do dashboard.
 *
 * Antes cada página montava o seu conteúdo direto no JSX; agora todo bloco
 * mora aqui com um identificador estável. É isso que permite o editor
 * visual: para mover um bloco de área basta trocar a área dele no registro
 * guardado, porque qualquer página sabe desenhar qualquer bloco.
 */
export type DashboardAreaId =
  "visao" | "financeiro" | "trafego" | "notificacoes" | "dados";

export interface DashboardBlockDefinition {
  id: string;
  /** Nome curto e claro, exibido no editor. */
  name: string;
  /** Explica o objetivo da seção no mapa e no cabeçalho padronizado. */
  description: string;
  /** Área onde o bloco nasce, antes de qualquer mudança do usuário. */
  area: DashboardAreaId;
  /** Menor largura segura no grid de 12 colunas. */
  minSpan?: number;
  /** Maior largura permitida no editor. */
  maxSpan?: number;
  /** Blocos compostos não devem receber altura fixa, pois isso corta conteúdo. */
  allowFixedHeight?: boolean;
}

export const DASHBOARD_BLOCKS: DashboardBlockDefinition[] = [
  {
    id: "visual-overview",
    name: "Panorama visual",
    description:
      "Receita, margem, pagamentos e aquisição reunidos em uma composição visual contínua.",
    area: "visao",
    minSpan: 12,
    maxSpan: 12,
    allowFixedHeight: false,
  },
  {
    id: "context",
    name: "Contexto do período",
    description:
      "Período ativo, metas e sinais que ajudam a interpretar o resultado antes de agir.",
    area: "financeiro",
    minSpan: 6,
  },
  {
    id: "financial-composition",
    name: "De onde vem o resultado",
    description:
      "Composição da receita, custos e descontos que explicam como o lucro foi formado.",
    area: "financeiro",
    minSpan: 8,
    allowFixedHeight: false,
  },
  {
    id: "profit-summary",
    name: "Resumo de lucro por período",
    description:
      "Compara hoje, semana, quinze dias e mês com a mesma escala e hierarquia visual.",
    area: "financeiro",
    minSpan: 6,
  },
  /* Painéis unificados são aplicações compostas. Permitir 25% ou 33% de
     largura criava colunas implícitas, textos microscópicos e rolagem
     horizontal. Eles continuam móveis entre áreas, mas ocupam a largura
     inteira para preservar a leitura e os gráficos. */
  {
    id: "traffic-unified",
    name: "Tráfego por rede e campanha",
    description:
      "Investimento, retorno e conversão organizados por canal, campanha, criativo e dia.",
    area: "trafego",
    minSpan: 12,
    maxSpan: 12,
    allowFixedHeight: false,
  },
  {
    id: "decisions",
    name: "Avisos sobre o negócio",
    description:
      "Prioriza riscos e oportunidades pelo impacto financeiro e pela urgência da ação.",
    area: "notificacoes",
    minSpan: 8,
    allowFixedHeight: false,
  },
  /* A lista do que precisa ser ligado (redes, gateway, loja) vem antes dos
     blocos de confiança: sem conexão não existe dado para confiar. */
  {
    id: "connections",
    name: "Conexões necessárias",
    description:
      "Mostra quais fontes estão ligadas, quais faltam e o que cada ausência compromete.",
    area: "dados",
    minSpan: 6,
    allowFixedHeight: false,
  },
  {
    id: "confidence",
    name: "Confiança dos dados",
    description:
      "Resume completude, atraso e consistência para indicar o quanto cada número é confiável.",
    area: "dados",
    minSpan: 6,
  },
  {
    id: "governance",
    name: "Fontes e sincronizações",
    description:
      "Detalha origem, última atualização e divergências das informações do painel.",
    area: "dados",
    minSpan: 6,
  },
];

export const BLOCK_BY_ID = new Map(
  DASHBOARD_BLOCKS.map((block) => [block.id, block]),
);

/**
 * Blocos que são uma sessão da visão executiva — todos desenham pelo mesmo
 * componente, mudando só qual sessão aparece.
 */
const EXECUTIVE_SECTIONS = new Set<string>([
  "context",
  "confidence",
  "financial-truth",
  "financial-composition",
  "decisions",
  "governance",
]);

/** Desenha um bloco pelo identificador. Devolve null se o id não existir. */
export function renderDashboardBlock(
  id: string,
  demoMode: boolean,
): ReactNode | null {
  if (id === "visual-overview") {
    return (
      <VisualOverview
        days={demoRevenueByYear}
        anchorDays={demoRevenueCurrentWeek}
        demoMode={demoMode}
      />
    );
  }

  if (EXECUTIVE_SECTIONS.has(id)) {
    return (
      <ExecutiveOverview
        days={demoRevenueByYear}
        anchorDays={demoRevenueCurrentWeek}
        demoMode={demoMode}
        operationMinMonth={demoOperationMinMonth}
        operationMaxMonth={demoOperationMaxMonth}
        dailyGoal={demoDailyRevenueGoal}
        hourlyByDay={demoRevenueByDayHour}
        sections={[id as ExecutiveSectionKey]}
        bare
      />
    );
  }

  /* O painel de tráfego segue a operação, a rede e o funil escolhidos no
     provedor. O centro diário de decisão mora dentro dele, na primeira
     coluna — não é um bloco solto. */
  if (id === "traffic-unified") return <AcquisitionDemoBoard />;

  if (id === "connections") return <ConnectionsChecklist demoMode={demoMode} />;

  if (id === "profit-summary") {
    return (
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-lg">Resumo de lucro por período</CardTitle>
          <CardDescription className="mt-1">
            Hoje, semana, quinze dias e mês lado a lado, sem misturar com
            indicadores operacionais.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <KpiGrid
            kpis={demoProfitSummary}
            columns="grid-cols-2 gap-3 md:grid-cols-4"
          />
        </CardContent>
      </Card>
    );
  }

  return null;
}
