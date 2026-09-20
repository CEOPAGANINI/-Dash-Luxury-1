"use client";

import * as React from "react";
import { Columns3, LayoutList, Table2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/* O ícone vai por nome: uma página do servidor não pode entregar uma
   função (o componente do ícone) a um componente do navegador. */
export type IconeVista = "colunas" | "tabela" | "lista";
const ICONES: Record<IconeVista, LucideIcon> = {
  colunas: Columns3,
  tabela: Table2,
  lista: LayoutList,
};

export interface Vista {
  id: string;
  label: string;
  icon?: IconeVista;
  conteudo: React.ReactNode;
}

/**
 * Abas entre leituras da mesma página. Os painéis chegam prontos do
 * servidor; aqui só se escolhe qual fica visível.
 */
export function QuadroViews({
  vistas,
  rotulo = "Vista",
}: {
  vistas: Vista[];
  rotulo?: string;
}) {
  const [ativa, setAtiva] = React.useState(vistas[0]?.id ?? "");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={rotulo} className="flex flex-wrap gap-2">
        {vistas.map(({ id, label, icon }) => {
          const Icon = icon ? ICONES[icon] : null;
          return (
          <Button
            key={id}
            role="tab"
            aria-selected={ativa === id}
            size="sm"
            variant={ativa === id ? "default" : "outline"}
            onClick={() => setAtiva(id)}
          >
            {Icon ? <Icon /> : null} {label}
          </Button>
          );
        })}
      </div>
      {vistas.map((v) => (
        <div key={v.id} hidden={ativa !== v.id}>
          {v.conteudo}
        </div>
      ))}
    </div>
  );
}
