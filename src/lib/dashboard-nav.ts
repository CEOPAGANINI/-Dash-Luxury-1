import {
  BadgeDollarSign,
  Bell,
  Database,
  Gauge,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Registro central das páginas do dashboard modular — sidebar, atalhos
 * executivos e cabeçalhos leem daqui para nunca divergirem entre si.
 * A ordem segue a cadeia de decisão do CEO.
 */
export interface DashboardPage {
  href: string;
  title: string;
  /** Nome curto para a sidebar e os atalhos. */
  short: string;
  description: string;
  icon: LucideIcon;
  /** Contagem demonstrativa exibida como selo na navegação (ex.: ações abertas). */
  badge?: number;
}

export const DASHBOARD_PAGES: DashboardPage[] = [
  {
    href: "/dashboard",
    title: "Visão geral",
    short: "Visão geral",
    description:
      "Panorama da operação, dos resultados aos pontos que exigem atenção.",
    icon: Gauge,
  },
  {
    href: "/dashboard/financeiro",
    title: "Financeiro",
    short: "Financeiro",
    description:
      "Caixa, receita, custos, lucro e margem separados por contexto financeiro.",
    icon: Wallet,
  },
  {
    href: "/dashboard/trafego",
    title: "Gestão de Tráfego",
    short: "Tráfego",
    description:
      "Canais, campanhas, criativos e retorno organizados para orientar investimento.",
    icon: BadgeDollarSign,
  },
  {
    href: "/dashboard/notificacoes",
    title: "Notificações",
    short: "Notificações",
    description:
      "Riscos e oportunidades priorizados por impacto financeiro e urgência.",
    icon: Bell,
    badge: 3,
  },
  {
    href: "/dashboard/dados",
    title: "Qualidade de Dados",
    short: "Dados",
    description:
      "Fontes, sincronizações e divergências que determinam a confiabilidade.",
    icon: Database,
    badge: 3,
  },
];
