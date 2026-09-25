"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SolarIcon,
  type SolarIconName,
  type SolarIconProps,
} from "@/components/command-layer/solar-icon";
import styles from "@/components/command-layer/shell.module.css";
import { cn } from "@/lib/utils";
import { NETWORK_MANAGERS } from "@/features/ads/manager-model";
import {
  SESSOES_DA_REDE,
  type SessaoDaRedeId,
} from "@/features/ads/network-sessions-model";
import type { AdNetwork } from "@/features/ads/types";

type NavigationIcon = React.ComponentType<Omit<SolarIconProps, "name">>;

function navigationIcon(name: SolarIconName): NavigationIcon {
  return function MenuIcon(props) {
    return <SolarIcon name={name} {...props} />;
  };
}

const Activity = navigationIcon("pulse-2");
const BarChart3 = navigationIcon("chart-2");
const Calculator = navigationIcon("calculator");
const Bell = navigationIcon("bell");
const BellRing = Bell;
const CircleDollarSign = navigationIcon("card");
const Landmark = navigationIcon("card");
const Columns3 = navigationIcon("layers");
const Database = navigationIcon("server-square");
const FileText = navigationIcon("document-text");
const Folder = navigationIcon("folder");
const FolderOpen = navigationIcon("folder-open");
const Globe = navigationIcon("globe");
const LayoutDashboard = navigationIcon("widget-2");
const LayoutGrid = LayoutDashboard;
const Megaphone = navigationIcon("routing-2");
const PanelsTopLeft = navigationIcon("layers");
const Plug = navigationIcon("plug-circle");
const Plus = navigationIcon("add-square");
const ScrollText = navigationIcon("document-text");
const Palette = navigationIcon("palette");
const Settings = navigationIcon("settings");
const ShieldCheck = navigationIcon("shield-check");
const ShoppingBag = navigationIcon("bag-4");
const SquarePen = navigationIcon("pen-new-square");
const FileZip = navigationIcon("file-zip");
const Search = navigationIcon("magnifier");
const Server = navigationIcon("server-square");
const Store = navigationIcon("shop");
const Table2 = navigationIcon("layers");
const Users = navigationIcon("users-group-rounded");
const Video = navigationIcon("play-circle");
const Wallet = navigationIcon("wallet");

interface PaginaDoMenu {
  title: string;
  href: string;
  icon: NavigationIcon;
  badge?: number;
  external?: boolean;
  /**
   * Quando acende. Sem isto, vale o prefixo do href — que faria
   * "Servidores" (/servidor) acender também em /servidor/sites e
   * /servidor/novo, que têm item próprio na mesma pasta.
   */
  corresponde?: RegExp;
}
interface PastaDoMenu {
  label: string;
  items: readonly PaginaDoMenu[];
  /** Ícone da categoria; quando omitido, usa a pasta padrão. */
  icon?: NavigationIcon;
  /** Título mostrado no topo da página para qualquer página desta pasta. */
  titulo?: string;
  /** Endereço-raiz da pasta: /campanhas/meta também conta como "dentro". */
  raiz?: string;
}

/* Cada rede de tráfego é uma pasta: abrir a pasta mostra todas as
   páginas que existem para essa rede no painel (por classe, tabela,
   gerenciador, métricas, calculadora). */
const ICONE_DA_REDE: Record<AdNetwork, NavigationIcon> = {
  meta: Megaphone,
  google: Search,
  youtube: Video,
};
const ICONE_DA_SESSAO: Record<SessaoDaRedeId, NavigationIcon> = {
  classes: LayoutGrid,
  tabela: Table2,
  gerenciador: Columns3,
  metricas: BarChart3,
  calculadora: Calculator,
};
const PASTAS_DAS_REDES: PastaDoMenu[] = (
  ["meta", "google", "youtube"] as const
).map((rede) => ({
  label: NETWORK_MANAGERS[rede].label,
  icon: ICONE_DA_REDE[rede],
  titulo: NETWORK_MANAGERS[rede].label,
  raiz: `/campanhas/${rede}`,
  items: SESSOES_DA_REDE.map((sessao) => ({
    title: sessao.short,
    href: `/campanhas/${rede}/${sessao.id}`,
    icon: ICONE_DA_SESSAO[sessao.id],
  })),
}));

const groups: PastaDoMenu[] = [
  {
    label: "Geral",
    items: [
      { title: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Monitor ao vivo", href: "/live-view", icon: Activity },
      { title: "Pedidos", href: "/pedidos", icon: ShoppingBag },
      { title: "Transações", href: "/checkouts", icon: CircleDollarSign },
      { title: "Gateways", href: "/gateways", icon: Landmark },
      { title: "Lojas conectadas", href: "/lojas", icon: Store },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Financeiro", href: "/dashboard/financeiro", icon: Wallet },
      { title: "Aquisição", href: "/dashboard/trafego", icon: BarChart3 },
      { title: "CRM", href: "/clientes", icon: Users },
      {
        title: "Alertas",
        href: "/dashboard/notificacoes",
        icon: Bell,
        badge: 3,
      },
      { title: "Notificações", href: "/notificacoes", icon: BellRing },
    ],
  },
  {
    label: "Páginas",
    icon: PanelsTopLeft,
    items: [
      { title: "Landing pages", href: "/landing-pages", icon: FileText },
      {
        title: "Editor de páginas",
        href: "/editor/landing-page",
        icon: SquarePen,
      },
      { title: "Baixar site", href: "/captura", icon: FileZip },
      { title: "Filtro de acesso", href: "/filtro-de-acesso", icon: Globe },
    ],
  },
  {
    label: "Servidor",
    icon: Server,
    titulo: "Servidor",
    raiz: "/servidor",
    items: [
      {
        title: "Servidores",
        href: "/servidor",
        icon: Server,
        // A lista e a página de um servidor (/servidor/<uuid>).
        corresponde: /^\/servidor(?:\/[0-9a-f-]{36})?$/,
      },
      { title: "Sites", href: "/servidor/sites", icon: Globe },
      { title: "Adicionar servidor", href: "/servidor/novo", icon: Plus },
    ],
  },
  ...PASTAS_DAS_REDES,
  {
    label: "Campanhas",
    items: [
      { title: "Todas as redes", href: "/campanhas/quadro", icon: Megaphone },
      {
        title: "Calculadora",
        href: "/campanhas/calculadora",
        icon: Calculator,
      },
      { title: "Análise", href: "/campanhas/analise", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Segurança", href: "/seguranca", icon: ShieldCheck },
      { title: "Design system", href: "/design-system", icon: Palette },
      { title: "Integrações", href: "/integracoes", icon: Plug },
      {
        title: "Qualidade dos dados",
        href: "/dashboard/dados",
        icon: Database,
      },
      { title: "Logs", href: "/logs", icon: ScrollText },
      { title: "Configurações", href: "/configuracoes", icon: Settings },
      { title: "Ver loja", href: "/loja", icon: Store, external: true },
    ],
  },
];

function itemIsActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/* Um item acende pela regra própria, se tiver; senão, pelo prefixo.
   itemIsActive continua a servir a raiz das pastas (group.raiz), que não
   é item e não tem regra própria. */
function itemAtivo(pathname: string, item: PaginaDoMenu) {
  return item.corresponde
    ? item.corresponde.test(pathname)
    : itemIsActive(pathname, item.href);
}

/** Páginas que existem mas não estão no menu: sem isto o topo diria só "Painel". */
const TITULOS_FORA_DO_MENU: Record<string, string> = {
  "/carrinhos": "Carrinhos",
  "/catalogo/categorias": "Categorias",
  "/catalogo/cupons": "Cupons",
  "/catalogo/estoque": "Estoque",
  "/catalogo/produtos": "Produtos",
  "/editor/checkout": "Editor de checkout",
  "/editor/fretes": "Fretes",
  "/editor/loja": "Editor da loja",
  "/emails": "E-mails",
  "/financeiro": "Financeiro",
  "/financeiro/entradas-saidas": "Entradas e saídas",
  "/financeiro/links-de-pagamento": "Links de pagamento",
  "/financeiro/processador": "Processador",
  "/financeiro/repasses": "Repasses",
  "/pixel": "Pixel",
  "/provas-sociais": "Provas sociais",
  "/webhooks": "Webhooks",
};

export function sidebarPageTitle(pathname: string) {
  for (const group of groups) {
    const item = group.items.find((item) => itemAtivo(pathname, item));
    if (item) return group.titulo ?? item.title;
  }
  for (const group of groups) {
    if (group.raiz && itemIsActive(pathname, group.raiz))
      return group.titulo ?? group.label;
  }
  const fora = Object.keys(TITULOS_FORA_DO_MENU)
    .filter((rota) => pathname === rota || pathname.startsWith(`${rota}/`))
    .sort((a, b) => b.length - a.length)[0];
  return fora ? TITULOS_FORA_DO_MENU[fora] : "Painel";
}

/** Uma pasta por vez; as outras categorias não ficam renderizadas nem focáveis. */
export function SidebarFolderNavigation({
  id,
  unreadCount,
  onNavigate,
}: {
  id?: string;
  unreadCount: number;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const [folder, setFolder] = React.useState<string | null>(null);
  const selected = groups.find((group) => group.label === folder);
  const panelId = React.useId();
  const backRef = React.useRef<HTMLButtonElement>(null);
  const folderRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const destination = pendingFocus.current;
    if (!destination) return;
    pendingFocus.current = null;
    if (selected) backRef.current?.focus();
    else folderRefs.current.get(destination)?.focus();
  }, [selected]);

  function openFolder(label: string) {
    pendingFocus.current = label;
    setFolder(label);
  }

  /* A pasta abre só no clique: passar o mouse por cima não abre nada. */

  function returnToFolders() {
    pendingFocus.current = folder;
    setFolder(null);
  }

  return (
    <nav
      id={id}
      aria-label="Navegação principal"
      data-folder-open={Boolean(selected)}
      className={`dash-sidebar-tray m-3 flex min-h-0 flex-col gap-1.5 border p-2 ${styles.folderTray}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          event.preventDefault();
          event.stopPropagation();
          returnToFolders();
        }
      }}
    >
      <div id={panelId} className="dash-sidebar-list">
        {selected ? (
          <>
            <button
              ref={backRef}
              type="button"
              onClick={returnToFolders}
              aria-label="Todas as pastas"
              className="dash-sidebar-block dash-sidebar-voltar focus-visible:ring-ring flex min-h-10 w-full items-center gap-2.5 px-3 py-1 text-left text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
            >
              <SolarIcon name="arrow-left" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                Sair da pasta · {selected.label}
              </span>
            </button>
            <h2 className="flex min-h-10 items-center gap-2.5 px-3 text-[13px] font-bold">
              {selected.icon ? (
                <selected.icon className="size-4 shrink-0" aria-hidden />
              ) : (
                <FolderOpen className="size-4 shrink-0" aria-hidden />
              )}
              {selected.label}
            </h2>
            {selected.items.map((item) => {
              const active = itemAtivo(pathname, item);
              const Icon = item.icon;
              const count =
                item.href === "/notificacoes" ? unreadCount : (item.badge ?? 0);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "dash-sidebar-block focus-visible:ring-ring relative flex min-h-10 items-center gap-2.5 px-3 py-1 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2",
                    active && "is-active",
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                  <span className="min-w-0 flex-1">{item.title}</span>
                  {count > 0 && (
                    <span className="dash-sidebar-selo">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        ) : (
          <>
            <p className="text-muted-foreground px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] uppercase">
              Pastas do menu
            </p>
            {groups.map((group) => {
              const current =
                group.items.some((item) => itemAtivo(pathname, item)) ||
                (!!group.raiz && itemIsActive(pathname, group.raiz));
              const IconePasta = group.icon ?? Folder;
              const selo = group.items.reduce(
                (total, item) =>
                  total +
                  (item.href === "/notificacoes"
                    ? unreadCount
                    : (item.badge ?? 0)),
                0,
              );
              return (
                <button
                  key={group.label}
                  ref={(element) => {
                    if (element) folderRefs.current.set(group.label, element);
                    else folderRefs.current.delete(group.label);
                  }}
                  type="button"
                  aria-label={`Abrir pasta ${group.label}`}
                  aria-controls={panelId}
                  aria-current={current ? "true" : undefined}
                  onClick={() => openFolder(group.label)}
                  className={cn(
                    "dash-sidebar-block focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left outline-none transition-colors focus-visible:ring-2",
                    current && "is-current",
                  )}
                >
                  <IconePasta
                    className="size-4 shrink-0 opacity-80"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold">
                      {group.label}
                    </span>
                    <span className="dash-sidebar-legenda mt-0.5 block text-[11px]">
                      {current
                        ? "Página atual nesta pasta"
                        : `${group.items.length} ${group.items.length === 1 ? "página" : "páginas"}`}
                    </span>
                  </span>
                  {selo > 0 && (
                    <span className="dash-sidebar-selo">
                      {selo > 9 ? "9+" : selo}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </nav>
  );
}
