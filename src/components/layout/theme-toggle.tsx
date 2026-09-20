"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/*
  O botão do tema, no rodapé do menu da esquerda: alterna entre o tema
  preto (padrão) e o tema branco com preto. O escolhido fica guardado no
  navegador (next-themes) e vale em todas as páginas. Antes de montar,
  o servidor não sabe o tema: o rótulo só aparece depois.
*/
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o tema só é conhecido no navegador
    setMontado(true);
  }, []);
  const branco = montado && theme === "branco";
  return (
    <button
      type="button"
      className="dash-sidebar-block dash-tema-botao focus-visible:ring-ring flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm font-semibold outline-none focus-visible:ring-2"
      aria-pressed={branco}
      aria-label={branco ? "Tema branco ativo. Trocar para o tema preto." : "Tema preto ativo. Trocar para o tema branco."}
      title="Trocar o tema do painel"
      onClick={() => setTheme(branco ? "preto" : "branco")}
    >
      {branco ? <Sun className="size-4 shrink-0" aria-hidden="true" /> : <Moon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{montado ? (branco ? "Tema branco" : "Tema preto") : "Tema"}</span>
    </button>
  );
}
