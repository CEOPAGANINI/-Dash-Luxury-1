import {
  LayoutDashboard,
  Eye,
  Wallet,
  ScrollText,
  Settings,
  Store,
  type LucideIcon,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  href: string;
}

export interface NavItem {
  title: string;
  href?: string;
  icon: LucideIcon;
  /** Fase em que o módulo será implementado (para empty states) */
  phase?: number;
  items?: NavSubItem[];
}

/**
 * Estrutura do menu lateral — espelha exatamente o briefing.
 */
export const navigation: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Live View", href: "/live-view", icon: Eye, phase: 5 },
  {
    title: "Financeiro",
    icon: Wallet,
    phase: 6,
    items: [
      { title: "Visão Geral", href: "/financeiro" },
      { title: "Entradas/Saídas", href: "/financeiro/entradas-saidas" },
      { title: "Processador", href: "/financeiro/processador" },
      { title: "Repasses", href: "/financeiro/repasses" },
      { title: "Link de pagamento", href: "/financeiro/links-de-pagamento" },
    ],
  },
  { title: "Logs", href: "/logs", icon: ScrollText, phase: 7 },
  { title: "Configurações", href: "/configuracoes", icon: Settings, phase: 1 },
  { title: "Ver loja", href: "/loja", icon: Store, phase: 2 },
];
