"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { SidebarFolderNavigation } from "@/components/layout/sidebar-folder-navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";

import type { SessionUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/features/auth/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  user: SessionUser;
  unreadCount: number;
}

function userInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SidebarSearch() {
  return (
    <label className="relative mx-3 block">
      <span className="sr-only">Buscar no painel</span>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        type="search"
        placeholder="Buscar"
        className="dash-sidebar-block border-input bg-background/40 h-10 w-full border pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

export function SidebarUtilities({
  user,
  onNavigate,
  onAccountOpenChange,
}: Pick<SidebarProps, "user"> & {
  onNavigate?: () => void;
  onAccountOpenChange?: (open: boolean) => void;
}) {
  const initials = userInitials(user.name);

  return (
    <div className="dash-sidebar-list dash-sidebar-rodape border-t p-3">
      <div className="dash-sidebar-block text-muted-foreground flex min-h-10 items-center gap-3 px-3 text-sm font-semibold">
        <span aria-hidden className="bg-success size-2 shrink-0 rounded-full" />
        <span className="truncate">Sistemas saudáveis</span>
        {/* A versão publicada (commit), para conferir o que está no ar. */}
        <span className="dash-versao ml-auto shrink-0 font-mono text-[0.625rem] font-semibold opacity-60" title={`Versão publicada: ${process.env.NEXT_PUBLIC_VERSAO ?? "local"}`}>
          v{process.env.NEXT_PUBLIC_VERSAO ?? "local"}
        </span>
      </div>
      {/* O tema do painel: preto (padrão) ou branco com preto. */}
      <ThemeToggle />

      <DropdownMenu onOpenChange={onAccountOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menu da conta"
            className="dash-sidebar-block focus-visible:ring-ring flex min-h-12 w-full items-center gap-3 px-2 text-left outline-none transition-colors focus-visible:ring-2"
          >
            <Avatar className="size-9 shrink-0">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">
                {user.name}
              </span>
              <span className="text-muted-foreground block font-mono text-[11px]">
                {user.email}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-56"
        >
          <DropdownMenuLabel>
            <p className="truncate">{user.name}</p>
            <p className="text-muted-foreground truncate text-xs font-normal">
              {user.email}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/configuracoes" onClick={onNavigate}>
              Configurações
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/loja" target="_blank" onClick={onNavigate}>
              Ver loja
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => logoutAction()}
          >
            Terminar sessão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Gaveta lateral de desktop. Fechada ocupa zero de largura e abre ao
 * encostar na borda esquerda. Aberta, entra no fluxo e não cobre o painel.
 */
export function AppSidebar({ user, unreadCount }: SidebarProps) {
  const [aberto, setAberto] = React.useState(false);
  const contaAbertaRef = React.useRef(false);
  const fechar = React.useCallback(() => setAberto(false), []);

  return (
    <>
      <button
        type="button"
        onPointerEnter={() => setAberto(true)}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        aria-expanded={aberto}
        aria-controls="menu-principal"
        aria-label="Abrir menu lateral"
        className={cn(
          "fixed inset-y-0 left-0 z-[60] hidden w-3 cursor-pointer bg-transparent opacity-0 outline-none lg:block",
          aberto && "pointer-events-none",
        )}
      />

      <aside
        aria-hidden={!aberto}
        inert={aberto ? undefined : true}
        onPointerEnter={() => setAberto(true)}
        onPointerLeave={(event) => {
          // Só fecha se o ponteiro saiu de verdade: uma pasta que se
          // redesenha sob o mouse dispara um "saiu" falso com o ponteiro
          // ainda dentro da gaveta.
          const r = event.currentTarget.getBoundingClientRect();
          const dentro = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
          if (dentro) return;
          if (!contaAbertaRef.current) fechar();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") fechar();
        }}
        className={cn(
          "sticky top-0 z-50 hidden h-svh max-h-svh shrink-0 overflow-hidden transition-[width,opacity,visibility] duration-200 ease-out motion-reduce:transition-none lg:flex",
          aberto ? "visible w-64 opacity-100" : "invisible w-0 opacity-0",
        )}
        data-open={String(aberto)}
      >
        {/* Todo o conteúdo acompanha uma única rolagem, sem cabeçalho ou rodapé fixados. */}
        <div className="dash-sidebar dash-sidebar-scroll h-full w-64 min-w-64 overflow-x-hidden overflow-y-auto overscroll-contain border-r">
          <Link
            href="/dashboard"
            onClick={fechar}
            className="dash-sidebar-cabecalho flex h-16 items-center gap-3 border-b px-4"
          >
            <span
              aria-hidden
              className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center font-display text-[15px] font-extrabold"
            >
              {brand.name.charAt(0)}
            </span>
            <span className="font-display text-[15px] font-extrabold tracking-[-0.01em]">
              {brand.name}
            </span>
          </Link>

          <SidebarSearch />

          <SidebarFolderNavigation
            id="menu-principal"
            unreadCount={unreadCount}
            onNavigate={fechar}
          />

          <SidebarUtilities
            user={user}
            onNavigate={fechar}
            onAccountOpenChange={(open) => {
              contaAbertaRef.current = open;
              if (!open) fechar();
            }}
          />
        </div>
      </aside>
    </>
  );
}
