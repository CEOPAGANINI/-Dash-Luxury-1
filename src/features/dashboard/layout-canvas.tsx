"use client";

import {
  DASHBOARD_BLOCKS,
  renderDashboardBlock,
  type DashboardAreaId,
} from "@/lib/dashboard-blocks";
import { BoardPager } from "@/components/dashboard/board-pager";

interface DashboardCanvasProps {
  area: DashboardAreaId;
  demoMode: boolean;
}

const SHORT_LABELS: Record<string, string> = {
  context: "Contexto",
  "financial-composition": "Composição",
  "profit-summary": "Lucro",
  decisions: "Avisos",
  connections: "Conexões",
  confidence: "Confiança",
  governance: "Fontes",
};

const AREA_LABELS: Record<DashboardAreaId, string> = {
  visao: "Visão geral",
  financeiro: "Financeiro",
  trafego: "Aquisição",
  notificacoes: "Alertas",
  dados: "Qualidade dos dados",
};

/**
 * Renderiza somente os blocos reais da área, sem moldura, numeração, título
 * duplicado ou altura artificial entre eles.
 */
export function DashboardCanvas({ area, demoMode }: DashboardCanvasProps) {
  const blocks = DASHBOARD_BLOCKS.filter((block) => block.area === area);

  const renderBlock = (block: (typeof blocks)[number]) => (
    <section
      key={block.id}
      id={`dashboard-section-${block.id}`}
      aria-label={block.name}
      className="dashboard-canvas-block min-w-0"
    >
      <div className="dashboard-block-content min-w-0">
        {renderDashboardBlock(block.id, demoMode)}
      </div>
    </section>
  );

  if (area !== "visao" && area !== "trafego") {
    return (
      <BoardPager
        ariaLabel={`Sessões de ${AREA_LABELS[area]}`}
        menuTitle={AREA_LABELS[area]}
        pages={blocks.map((block) => ({
          label: block.name,
          short: SHORT_LABELS[block.id] ?? block.name,
          content: renderBlock(block),
        }))}
      />
    );
  }

  return (
    <div className="dashboard-canvas-grid grid gap-4">
      {blocks.map(renderBlock)}
    </div>
  );
}
