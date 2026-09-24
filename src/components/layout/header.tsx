"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SolarIcon } from "@/components/command-layer/solar-icon";
import styles from "@/components/command-layer/shell.module.css";
import { ThemeToggle } from "@/components/layout/theme-toggle";

import { brand } from "@/lib/brand";
import type { SessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  SidebarSearch,
  SidebarUtilities,
} from "@/components/layout/app-sidebar";
import {
  SidebarFolderNavigation,
  sidebarPageTitle,
} from "@/components/layout/sidebar-folder-navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface HeaderProps {
  user: SessionUser;
  unreadCount: number;
}

export function Header({ user, unreadCount }: HeaderProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div className={`nebula-topbar ${styles.topbar}`}>
      <header className={styles.navigation}>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir menu"
              className={styles.iconButton}
            >
              <SolarIcon name="hamburger-menu" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            data-design-system="commandlayer"
            className={`dash-skin cl flex w-72 flex-col border-0 p-0 sm:max-w-72 ${styles.sidebar}`}
            showClose={false}
            onEscapeKeyDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('[data-folder-open="true"]')
              ) {
                event.preventDefault();
              }
            }}
          >
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <div
              className={`dash-sidebar dash-sidebar-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${styles.sidebar}`}
            >
              <div
                className={`dash-sidebar-cabecalho flex items-center gap-3 ${styles.sidebarHeader}`}
              >
                <div className={`nebula-brand-mark ${styles.brandMark}`}>
                  <SolarIcon name="bolt" size={18} />
                </div>
                <span className={styles.brandName}>
                  <span className={styles.brandLabel}>Painel de controle</span>
                  {brand.name}
                </span>
              </div>
              <SidebarSearch />
              <SidebarFolderNavigation
                unreadCount={unreadCount}
                onNavigate={() => setDrawerOpen(false)}
              />
              <SidebarUtilities
                user={user}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
        <Link
          href="/dashboard"
          aria-label={brand.name}
          className={`nebula-brand ${styles.brand}`}
        >
          <div className={`nebula-brand-mark ${styles.brandMark}`}>
            <SolarIcon name="bolt" size={18} />
          </div>
          <span className={`${styles.brandCopy} ${styles.brandName}`}>
            <span className={styles.brandLabel}>Painel de controle</span>
            {brand.name}
          </span>
        </Link>
        <span aria-hidden className={styles.divider} />
        <h1 className={styles.pageTitle}>{sidebarPageTitle(pathname)}</h1>
        <div className={styles.actions}>
          <ThemeToggle compact />
          <Link
            href="/notificacoes"
            aria-label={
              unreadCount > 0
                ? `Notificações: ${unreadCount} não lidas`
                : "Notificações"
            }
            className={styles.iconButton}
          >
            <SolarIcon name="bell" />
            {unreadCount > 0 && (
              <span aria-hidden className={styles.notificationCount}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </header>
    </div>
  );
}
