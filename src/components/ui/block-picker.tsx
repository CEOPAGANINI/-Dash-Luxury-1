"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/*
  Escolha por blocos: no lugar de um menu suspenso, cada opção é um botão
  quadrado; o escolhido fica claro, os outros em cinza. Funciona como um
  grupo de rádio (setas trocam a opção) e, com `name`, entra num <form>
  pelo campo escondido. Com `collapsible`, mostra só o bloco escolhido e
  abre a lista de blocos ao clicar — para lugares apertados, como um cartão.
*/

export interface BlockOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface BlockPickerProps {
  options: BlockOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  ariaLabel?: string;
  labelledBy?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  stretch?: boolean;
  collapsible?: boolean;
  /** "claro": trilho branco com o bloco escolhido em preto (estilo pílula). */
  tone?: "escuro" | "claro";
  className?: string;
}

export function BlockPicker({
  options,
  value,
  defaultValue,
  onChange,
  name,
  id,
  ariaLabel,
  labelledBy,
  disabled = false,
  size = "md",
  stretch = false,
  collapsible = false,
  tone = "escuro",
  className,
}: BlockPickerProps) {
  const [interno, setInterno] = React.useState(
    defaultValue ?? options[0]?.value ?? "",
  );
  const [aberto, setAberto] = React.useState(false);
  const atual = value ?? interno;
  const escolhida = options.find((o) => o.value === atual);
  const grupoId = React.useId();

  function escolher(v: string) {
    if (disabled) return;
    if (value === undefined) setInterno(v);
    onChange?.(v);
    if (collapsible) setAberto(false);
  }

  function teclado(e: React.KeyboardEvent<HTMLDivElement>) {
    const passo =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!passo) return;
    e.preventDefault();
    const ativas = options.filter((o) => !o.disabled);
    if (ativas.length === 0) return;
    const i = ativas.findIndex((o) => o.value === atual);
    const proxima = ativas[(i + passo + ativas.length) % ativas.length];
    escolher(proxima.value);
    const alvo = e.currentTarget.querySelector<HTMLButtonElement>(
      `[data-value="${CSS.escape(proxima.value)}"]`,
    );
    alvo?.focus();
  }

  const grupo = (
    <div
      role="radiogroup"
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      data-value={atual}
      data-size={size}
      data-tone={tone}
      data-stretch={stretch || undefined}
      className={cn("block-picker", !collapsible && className)}
      onKeyDown={teclado}
    >
      {options.map((o) => {
        const marcada = o.value === atual;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={marcada}
            data-value={o.value}
            title={o.title}
            disabled={disabled || o.disabled}
            tabIndex={marcada ? 0 : -1}
            onClick={() => escolher(o.value)}
          >
            {o.label}
          </button>
        );
      })}
      {name ? <input type="hidden" name={name} value={atual} /> : null}
    </div>
  );

  if (!collapsible) return grupo;

  return (
    <div
      className={cn("block-picker-shell", className)}
      data-value={atual}
      data-size={size}
    >
      <button
        type="button"
        className="block-picker-toggle"
        aria-label={ariaLabel}
        aria-expanded={aberto}
        aria-controls={grupoId}
        disabled={disabled}
        onClick={() => setAberto((v) => !v)}
      >
        {escolhida?.label ?? "Escolher"}
        <span aria-hidden="true" className="block-picker-toggle-mark">
          {aberto ? "–" : "+"}
        </span>
      </button>
      <div id={grupoId} hidden={!aberto}>
        {aberto ? grupo : null}
      </div>
      {!aberto && name ? <input type="hidden" name={name} value={atual} /> : null}
    </div>
  );
}
