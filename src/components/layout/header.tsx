"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Zap } from "lucide-react";

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
    <div className="sticky top-0 z-40 lg:hidden">
      <header className="dash-band bg-background/80 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-sm md:px-5">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="dash-skin flex w-72 flex-col border-0 p-0 sm:max-w-72"
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
            <div className="dash-sidebar dash-sidebar-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              <div className="flex h-16 items-center gap-2 px-4">
                <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center">
                  <Zap className="size-4.5" />
                </div>
                <span className="text-base font-bold tracking-tight">
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
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <div className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center">
            <Zap className="size-4" />
          </div>
          <span className="hidden text-[length:var(--text-card-title)] font-bold tracking-tight sm:block">
            {brand.name}
          </span>
        </Link>
        <h1 className="truncate text-[length:var(--text-card-title)] font-semibold">
          {sidebarPageTitle(pathname)}
        </h1>
      </header>
    </div>
  );
}
