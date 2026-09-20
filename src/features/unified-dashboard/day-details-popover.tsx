"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import styles from "./acquisition-calendar.module.css";

export interface DayPreview {
  date: string;
  anchor: HTMLButtonElement;
  context: string;
}

/** A non-modal preview: never consumes a calendar column or moves its cells. */
export function DayDetailsPopover({
  preview,
  id,
  onClose,
  onKeepOpen,
  onLeave,
  children,
}: {
  preview: DayPreview;
  id: string;
  onClose: (restoreFocus?: boolean) => void;
  onKeepOpen: () => void;
  onLeave: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const anchor = preview.anchor;
    const viewport = window.visualViewport;
    const position = () => {
      const margin = 12;
      const gap = 10;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const originX = viewport?.offsetLeft ?? 0;
      const originY = viewport?.offsetTop ?? 0;
      const bounds = anchor.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
      panel.style.width = `${Math.min(400, width - margin * 2)}px`;
      const panelWidth = panel.getBoundingClientRect().width;
      const spaceRight = originX + width - bounds.right - margin - gap;
      const spaceLeft = bounds.left - originX - margin - gap;
      let left: number;
      let top: number;
      if (spaceRight >= panelWidth || spaceLeft >= panelWidth) {
        left =
          spaceRight >= panelWidth
            ? bounds.right + gap
            : bounds.left - panelWidth - gap;
        const panelHeight = panel.getBoundingClientRect().height;
        top = Math.max(
          originY + margin,
          Math.min(bounds.top, originY + height - panelHeight - margin),
        );
      } else {
        const below = originY + height - bounds.bottom - margin - gap;
        const above = bounds.top - originY - margin - gap;
        const available = Math.max(below, above);
        // On compact screens prefer a readable, scrollable preview to a tiny sliver.
        panel.style.maxHeight = `${available >= 280 ? available : height - margin * 2}px`;
        const panelHeight = panel.getBoundingClientRect().height;
        left = Math.max(
          originX + margin,
          Math.min(bounds.left, originX + width - panelWidth - margin),
        );
        top =
          available < 280
            ? originY + Math.max(margin, (height - panelHeight) / 2)
            : below >= above
              ? bounds.bottom + gap
              : bounds.top - gap - panelHeight;
      }
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = "visible";
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(panel);
    resize.observe(anchor);
    // Pages remain mounted under BoardPager. A portal must close when its page hides.
    const hidden = new MutationObserver(() => {
      if (
        !anchor.isConnected ||
        anchor.closest('[hidden], [aria-hidden="true"]')
      )
        onClose();
    });
    let parent: HTMLElement | null = anchor;
    while (parent) {
      hidden.observe(parent, {
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden"],
      });
      parent = parent.parentElement;
    }
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        !anchor.contains(event.target)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(panel.contains(document.activeElement));
      }
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      const bounds = anchor.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) onClose();
      else position();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", position);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    return () => {
      resize.disconnect();
      hidden.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", position);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
    };
  }, [preview.anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label="Detalhes do dia"
      aria-modal="false"
      className={styles.popover}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onLeave}
      onFocus={onKeepOpen}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onLeave();
      }}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (
          event.key === "Tab" &&
          event.shiftKey &&
          event.target === ref.current?.querySelector("button")
        ) {
          event.preventDefault();
          preview.anchor.focus({ preventScroll: true });
        }
      }}
    >
      <div className={styles.popoverHeading}>
        <h3>Detalhes do dia</h3>
        <button
          type="button"
          onClick={() => onClose(true)}
          aria-label="Fechar detalhes do dia"
        >
          Fechar
        </button>
      </div>
      {children}
    </div>,
    document.body,
  );
}
