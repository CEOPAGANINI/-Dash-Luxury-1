"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/*
  Um painel flutuante preso a um elemento (a faixa de uma campanha, o
  cabeçalho de um bloco): abre num portal fora do quadro, logo abaixo
  da âncora (ou acima, sem espaço), sempre dentro da tela; fecha com Esc
  ou ao clicar fora. As medidas vêm do layout (offsetHeight), não do
  retângulo desenhado: a animação de entrada encolhe o painel por um
  instante e o hover desloca a âncora uns pixels.
*/
export function PainelFlutuante({
  ancora,
  rotulo,
  onClose,
  children,
  id,
  larguraMinima = 280,
  className,
}: {
  ancora: HTMLElement;
  rotulo: string;
  onClose: () => void;
  children: React.ReactNode;
  id?: string;
  larguraMinima?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const painel = ref.current;
    if (!painel) return;
    const posicionar = () => {
      const margem = 8;
      const folga = 8;
      const r = ancora.getBoundingClientRect();
      const largura = Math.min(Math.max(r.width, larguraMinima), window.innerWidth - margem * 2);
      painel.style.width = `${largura}px`;
      const altura = painel.offsetHeight;
      const abaixo = window.innerHeight - r.bottom - margem;
      const top = abaixo >= altura + folga ? r.bottom + folga : Math.max(margem, r.top - altura - folga);
      const left = Math.max(margem, Math.min(r.left, window.innerWidth - largura - margem));
      painel.style.top = `${top}px`;
      painel.style.left = `${left}px`;
      painel.style.visibility = "visible";
    };
    posicionar();
    painel.addEventListener("animationend", posicionar);
    const fora = (e: Event) => {
      if (e.target instanceof Node && !painel.contains(e.target) && !ancora.contains(e.target)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", posicionar);
    document.addEventListener("scroll", posicionar, true);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(posicionar);
    ro?.observe(painel);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", posicionar);
      document.removeEventListener("scroll", posicionar, true);
      painel.removeEventListener("animationend", posicionar);
      ro?.disconnect();
    };
  }, [ancora, onClose, larguraMinima]);
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={rotulo}
      aria-modal="false"
      className={className ? `class-board-painel-cartao ${className}` : "class-board-painel-cartao"}
      onWheel={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
