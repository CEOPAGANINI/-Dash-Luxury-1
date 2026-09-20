"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid, Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PageSessionMenuItem {
  label: string;
  short: string;
  icon?: React.ReactNode;
}

/** Um grupo extra de destinos (páginas independentes) ao lado das sessões. */
export interface PageSessionMenuGroup {
  title: string;
  items: { label: string; short: string; href: string; active?: boolean }[];
}

interface PageSessionMenuProps {
  items: PageSessionMenuItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  title: string;
  groups?: PageSessionMenuGroup[];
  sectionTitle?: string;
}

/*
  Menu de sessões da página: uma gaveta na borda DIREITA da tela, com o
  mesmo desenho da gaveta da esquerda (a mesma caixa, os mesmos blocos
  com ícone, título e legenda) — só que, em vez de pastas, lista as
  redes (páginas independentes) e as sessões desta página, numeradas.
  Encostar o mouse na borda (ou focar o gatilho invisível) abre; a
  gaveta entra no fluxo como uma coluna ao lado do conteúdo, nunca por
  cima dele. Fecha ao sair com o mouse, com Esc ou ao escolher.
*/
export function PageSessionMenu({
  items,
  activeIndex,
  onSelect,
  ariaLabel,
  title,
  groups = [],
  sectionTitle,
}: PageSessionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const sidebarRef = React.useRef<HTMLElement>(null);
  const returningFocusRef = React.useRef(false);

  function close() {
    setOpen(false);
    if (sidebarRef.current?.contains(document.activeElement)) {
      returningFocusRef.current = true;
      triggerRef.current?.focus({ preventScroll: true });
      returningFocusRef.current = false;
    }
  }

  function select(index: number) {
    onSelect(index);
    close();
  }

  const rotuloSessoes = sectionTitle ?? (groups.length ? `Sessões de ${title}` : "Sessões desta página");
  const blocoClasse =
    "dash-sidebar-block sessoes-lateral-item focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left outline-none transition-colors focus-visible:ring-2";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onPointerEnter={() => setOpen(true)}
        onFocus={() => {
          if (!returningFocusRef.current) setOpen(true);
        }}
        // Já abriu ao encostar; o clique confirma (fecha com Esc, ao sair ou ao escolher).
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Abrir menu de sessões desta página"
        className={`board-pager-menu-trigger${open ? " is-open" : ""}`}
      />

      <aside
        ref={sidebarRef}
        aria-hidden={!open}
        inert={open ? undefined : true}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={(event) => {
          // Só fecha se o ponteiro saiu de verdade da gaveta (um bloco que se
          // redesenha sob o mouse dispara um "saiu" falso).
          const r = event.currentTarget.getBoundingClientRect();
          const dentro =
            r.width > 0 && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
          if (!dentro) close();
        }}
        onWheel={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
        className="board-pager-sidebar"
        data-open={String(open)}
      >
        {/* A mesma caixa da gaveta da esquerda: fundo de camada 1, rolagem
            própria, e a bandeja com os blocos. */}
        <div className="dash-sidebar dash-sidebar-scroll sessoes-lateral-caixa h-full w-64 min-w-64 overflow-x-hidden overflow-y-auto overscroll-contain border-l">
          <nav id={menuId} className="dash-sidebar-tray sessoes-lateral m-3 flex min-h-0 flex-col gap-1.5 border p-2" aria-label={ariaLabel} data-titulo={title}>
            {groups.map((group) => (
              <div key={group.title} className="dash-sidebar-list sessoes-lateral-grupo">
                <p className="text-muted-foreground px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] uppercase">{group.title}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(blocoClasse, item.active && "is-active")}
                    aria-current={item.active ? "page" : undefined}
                    aria-label={`Abrir ${item.short}: ${item.label}`}
                    onClick={close}
                  >
                    <Megaphone className="size-4 shrink-0 opacity-80" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="sessoes-lateral-curto block text-[13px] font-bold">{item.short}</span>
                      <span className="dash-sidebar-legenda sessoes-lateral-legenda mt-0.5 block text-[11px]">{item.label}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}

            <div className="dash-sidebar-list sessoes-lateral-grupo">
              <p className="text-muted-foreground px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] uppercase">{rotuloSessoes}</p>
              {items.map((item, index) => {
                const ativa = activeIndex === index;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={cn(blocoClasse, ativa && "is-active")}
                    aria-current={ativa ? "page" : undefined}
                    aria-label={`Abrir sessão ${index + 1}: ${item.label}`}
                    onClick={() => select(index)}
                  >
                    {item.icon ? (
                      <span className="sessoes-lateral-icone size-4 shrink-0 opacity-80" aria-hidden="true">{item.icon}</span>
                    ) : (
                      <LayoutGrid className="size-4 shrink-0 opacity-80" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="sessoes-lateral-curto block text-[13px] font-bold">
                        <span className="sessoes-lateral-numero" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                        {item.short}
                      </span>
                      <span className="dash-sidebar-legenda sessoes-lateral-legenda mt-0.5 block text-[11px]">{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}
