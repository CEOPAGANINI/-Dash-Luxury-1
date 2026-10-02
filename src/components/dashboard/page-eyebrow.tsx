"use client";

import { usePathname } from "next/navigation";

import { sidebarFolderLabel } from "@/components/layout/sidebar-folder-navigation";

/**
 * Eyebrow do cabeçalho de página (design system Futurist Workflow): a
 * pasta do menu onde a página mora, em caixa alta pequena com o filete
 * ciano à esquerda. Só lê o caminho; não muda nada.
 */
export function PageEyebrow({ texto }: { texto?: string }) {
  const pathname = usePathname();
  return (
    <span className="fw-eyebrow">{texto ?? sidebarFolderLabel(pathname)}</span>
  );
}
