"use client";

import * as React from "react";
import Link from "next/link";
import { FolderOpen, LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PageSessionMenuItem {
  label: string;
  short: string;
  icon?: React.ReactNode;
}

/** Uma página dentro de uma pasta do menu da direita. */
export interface PaginaDaPasta {
  label: string;
  short: string;
  href: string;
  active?: boolean;
  icon?: React.ReactNode;
}

/** Uma pasta do menu da direita: abre e mostra só as páginas dela. */
export interface PastaLateral {
  id: string;
  label: string;
  legenda: string;
  icon?: React.ReactNode;
  /** A página atual está nesta pasta. */
  atual?: boolean;
  paginas: PaginaDaPasta[];
}

interface PageSessionMenuProps {
  items: PageSessionMenuItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  title: string;
  /**
   * Com pastas, o menu funciona como o da esquerda: primeiro a lista de
   * pastas; abrir uma mostra só as páginas dela, com "Sair da pasta".
   * As sessões (items) não são mostradas nesse modo.
   */
  pastas?: PastaLateral[];
  /** O rótulo em cima da lista de pastas. */
  rotuloDasPastas?: string;
}

/*
  Menu de sessões da página: uma gaveta na borda DIREITA da tela, com o
  mesmo desenho da gaveta da esquerda (a mesma caixa, os mesmos blocos
  com ícone, título e legenda) — só que, em vez de pastas do painel,
  lista as sessões desta página, numeradas; ou, nas páginas de rede, as
  pastas das redes, cada uma com as suas páginas dentro.
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
  pastas,
  rotuloDasPastas = "Pastas do menu",
}: PageSessionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const sidebarRef = React.useRef<HTMLElement>(null);
  const returningFocusRef = React.useRef(false);
  /* A pasta aberta (só com pastas). Como no menu da esquerda: uma pasta
     por vez; as outras não ficam renderizadas nem focáveis. */
  const [pastaAberta, setPastaAberta] = React.useState<string | null>(null);
  const pasta = pastas?.find((p) => p.id === pastaAberta) ?? null;
  const voltarRef = React.useRef<HTMLButtonElement>(null);
  const pastaRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const focoPendente = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const destino = focoPendente.current;
    if (!destino) return;
    focoPendente.current = null;
    if (pasta) voltarRef.current?.focus();
    else pastaRefs.current.get(destino)?.focus();
  }, [pasta]);

  function abrirPasta(id: string) {
    focoPendente.current = id;
    setPastaAberta(id);
  }
  function voltarAsPastas() {
    focoPendente.current = pastaAberta;
    setPastaAberta(null);
  }

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
            // Dentro de uma pasta, Esc volta às pastas; fora, fecha a gaveta.
            if (pasta) voltarAsPastas();
            else close();
          }
        }}
        className="board-pager-sidebar"
        data-open={String(open)}
      >
        {/* A mesma caixa da gaveta da esquerda: fundo de camada 1, rolagem
            própria, e a bandeja com os blocos. */}
        <div className="dash-sidebar dash-sidebar-scroll sessoes-lateral-caixa h-full w-64 min-w-64 overflow-x-hidden overflow-y-auto overscroll-contain border-l">
          {/* O mesmo cabeçalho da gaveta da esquerda (a marca lá; a página aqui). */}
          <div className="dash-sidebar-cabecalho flex h-16 items-center gap-3 px-4" data-testid="sessoes-lateral-cabecalho">
            <span
              aria-hidden
              className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center font-display text-[15px] font-extrabold"
            >
              {title.charAt(0)}
            </span>
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-extrabold tracking-[-0.01em]">{title}</span>
          </div>
          <nav
            id={menuId}
            className="dash-sidebar-tray sessoes-lateral m-3 flex min-h-0 flex-col gap-1.5 border p-2"
            aria-label={ariaLabel}
            data-titulo={title}
            data-folder-open={pastas ? Boolean(pasta) : undefined}
          >
            {pastas ? (
              <div className="dash-sidebar-list sessoes-lateral-grupo">
                {pasta ? (
                  <>
                    <button
                      ref={voltarRef}
                      type="button"
                      onClick={voltarAsPastas}
                      aria-label="Todas as pastas"
                      className="dash-sidebar-block dash-sidebar-voltar focus-visible:ring-ring flex min-h-10 w-full items-center gap-2.5 px-3 py-1 text-left text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span aria-hidden className="text-[13px] opacity-70">‹</span>
                      <span className="min-w-0 flex-1">Sair da pasta · {pasta.label}</span>
                    </button>
                    <h2 className="flex min-h-10 items-center gap-2.5 px-3 text-[13px] font-bold">
                      {pasta.icon ? (
                        <span className="sessoes-lateral-icone size-4 shrink-0" aria-hidden="true">{pasta.icon}</span>
                      ) : (
                        <FolderOpen className="size-4 shrink-0" aria-hidden />
                      )}
                      {pasta.label}
                    </h2>
                    {pasta.paginas.map((pagina, index) => (
                      <Link
                        key={pagina.href}
                        href={pagina.href}
                        className={cn(blocoClasse, pagina.active && "is-active")}
                        aria-current={pagina.active ? "page" : undefined}
                        aria-label={`Abrir página ${index + 1}: ${pagina.label}`}
                        onClick={close}
                      >
                        {pagina.icon ? (
                          <span className="sessoes-lateral-icone size-4 shrink-0 opacity-80" aria-hidden="true">{pagina.icon}</span>
                        ) : (
                          <LayoutGrid className="size-4 shrink-0 opacity-80" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="sessoes-lateral-curto block text-[13px] font-bold">
                            <span className="sessoes-lateral-numero" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                            {pagina.short}
                          </span>
                          <span className="dash-sidebar-legenda sessoes-lateral-legenda mt-0.5 block text-[11px]">{pagina.label}</span>
                        </span>
                      </Link>
                    ))}
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] uppercase">{rotuloDasPastas}</p>
                    {pastas.map((p) => (
                      <button
                        key={p.id}
                        ref={(element) => {
                          if (element) pastaRefs.current.set(p.id, element);
                          else pastaRefs.current.delete(p.id);
                        }}
                        type="button"
                        aria-label={`Abrir pasta ${p.label}`}
                        aria-current={p.atual ? "true" : undefined}
                        onClick={() => abrirPasta(p.id)}
                        className={cn(blocoClasse, p.atual && "is-current")}
                      >
                        {p.icon ? (
                          <span className="sessoes-lateral-icone size-4 shrink-0 opacity-80" aria-hidden="true">{p.icon}</span>
                        ) : (
                          <LayoutGrid className="size-4 shrink-0 opacity-80" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="sessoes-lateral-curto block text-[13px] font-bold">{p.label}</span>
                          <span className="dash-sidebar-legenda sessoes-lateral-legenda mt-0.5 block text-[11px]">
                            {p.atual ? "Página atual nesta pasta" : `${p.paginas.length} ${p.paginas.length === 1 ? "página" : "páginas"}`}
                          </span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="dash-sidebar-list sessoes-lateral-grupo">
                <p className="text-muted-foreground px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] uppercase">Sessões desta página</p>
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
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
