"use client";

import * as React from "react";

import { PageSessionMenu } from "@/components/dashboard/page-session-menu";
import { BlockPicker } from "@/components/ui/block-picker";

export interface BoardPage {
  label: string;
  short: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

export function BoardPager({
  pages,
  ariaLabel,
  menuTitle,
  paginateOnMobile = false,
  renderHeader,
}: {
  pages: BoardPage[];
  ariaLabel: string;
  menuTitle: string;
  paginateOnMobile?: boolean;
  renderHeader?: (activeIndex: number) => React.ReactNode;
}) {
  const [ativa, setAtiva] = React.useState(0);
  const [pagerAtivo, setPagerAtivo] = React.useState(paginateOnMobile);
  const ativaRef = React.useRef(0);
  const travaRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const consulta = window.matchMedia("(min-width: 64rem)");
    const aplicar = () => setPagerAtivo(paginateOnMobile || consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, [paginateOnMobile]);

  const irPara = React.useCallback(
    (destino: number, ancora: "topo" | "fim") => {
      const alvo = Math.max(0, Math.min(pages.length - 1, destino));
      if (alvo === ativaRef.current) return false;
      ativaRef.current = alvo;
      setAtiva(alvo);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top:
              ancora === "topo"
                ? 0
                : document.documentElement.scrollHeight - window.innerHeight,
            behavior: "auto",
          });
        });
      });
      return true;
    },
    [pages.length],
  );

  React.useEffect(() => {
    if (!pagerAtivo) return;

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < 4 || travaRef.current !== null) return;

      const doc = document.documentElement;
      const noFim = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      const noTopo = window.scrollY <= 2;

      let trocou = false;
      if (event.deltaY > 0 && noFim) {
        trocou = irPara(ativaRef.current + 1, "topo");
      } else if (event.deltaY < 0 && noTopo) {
        trocou = irPara(ativaRef.current - 1, "fim");
      }
      if (!trocou) return;

      travaRef.current = window.setTimeout(() => {
        travaRef.current = null;
      }, 550);
    }

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      if (travaRef.current !== null) {
        window.clearTimeout(travaRef.current);
        travaRef.current = null;
      }
    };
  }, [pagerAtivo, irPara]);

  return (
    <div className="board-pager" data-pager-ready={String(pagerAtivo)}>
      {paginateOnMobile && (
        <div className="board-pager-mobile-nav">
          <span>Sessão da página</span>
          <BlockPicker
            ariaLabel={ariaLabel}
            size="sm"
            stretch
            value={String(ativa)}
            onChange={(v) => irPara(Number(v), "topo")}
            options={pages.map((page, index) => ({
              value: String(index),
              label: `${String(index + 1).padStart(2, "0")} · ${page.short}`,
            }))}
          />
        </div>
      )}
      {pagerAtivo && (
        <PageSessionMenu
          items={pages}
          activeIndex={ativa}
          onSelect={(index) => irPara(index, "topo")}
          ariaLabel={ariaLabel}
          title={menuTitle}
        />
      )}

      <div className="board-pager-content">
        {renderHeader?.(ativa)}
        <p className="sr-only">
          {pagerAtivo
            ? `Conteúdo em ${pages.length} sessões. Role até o fim da sessão para ir à seguinte, ou use o menu de sessões.`
            : `Conteúdo em ${pages.length} sessões, uma abaixo da outra.`}
        </p>
        {pagerAtivo && (
          <p className="sr-only" aria-live="polite">
            Sessão {ativa + 1} de {pages.length}: {pages[ativa]?.label}
          </p>
        )}

        {pages.map((page, index) => (
          <section
            key={page.label}
            className="board-pager-page"
            data-active={String(!pagerAtivo || ativa === index)}
            hidden={pagerAtivo && ativa !== index}
            aria-label={page.label}
          >
            {page.content}
          </section>
        ))}
      </div>
    </div>
  );
}
