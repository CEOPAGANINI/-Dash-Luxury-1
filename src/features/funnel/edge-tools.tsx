"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import type { EstiloLinha, FunnelEdge } from "./funnel-model";
import {
  useEdgePreparation,
  type EdgePreparationScope,
} from "./edge-flow-signal";

const COLORS = [
  "#AAB4C0",
  "#22E58B",
  "#71B7FF",
  "#B6A0FF",
  "#F2C66D",
  "#FF919B",
];
type Props = {
  edge: FunnelEdge;
  scope: EdgePreparationScope;
  position: { left: number; top: number; maxHeight: number };
  flowEnabled: boolean;
  flowGlobal: boolean;
  locked: boolean;
  onStyle: (patch: Partial<EstiloLinha>) => void;
  onLabel: (value: string) => void;
  onReset: () => void;
  onDelete: () => void;
  onGlobalFlow: () => void;
};

/** Configuração real da conexão selecionada; os dados pertencem ao quadro. */
export function EdgeTools({
  edge,
  scope,
  position,
  flowEnabled,
  flowGlobal,
  locked,
  onStyle,
  onLabel,
  onReset,
  onDelete,
  onGlobalFlow,
}: Props) {
  const style = edge.estilo ?? {};
  const preparation = useEdgePreparation(scope);
  const color = /^#[0-9a-f]{6}$/i.test(style.cor ?? "")
    ? style.cor!
    : "#aab4c0";
  return (
    <div
      className="funnel__ltb funnel__edge-tools"
      style={position as CSSProperties}
      onPointerDown={(e) => e.stopPropagation()}
      role="region"
      aria-label="Editar conexão"
    >
      <header className="funnel__edge-tools-header">
        <strong>Conexão</strong>
        <span
          className="funnel__edge-tools-status"
          data-state={preparation.state}
        >
          {flowEnabled && flowGlobal ? preparation.label : "Fluxo desligado"}
        </span>
        <p>Arraste o fio para dobrar. Arraste as pontas para qualquer borda.</p>
        <small>
          A luz indica a configuração do percurso. Não representa visitas reais.
        </small>
        {!edge.id.startsWith("rr:") && (
          <input
            className="funnel__ltb-nome"
            aria-label="Nome da conexão"
            placeholder="Nome da saída"
            maxLength={100}
            value={edge.rotulo ?? ""}
            disabled={locked}
            onChange={(e) => onLabel(e.target.value)}
          />
        )}
      </header>
      <fieldset className="funnel__edge-tools-group" disabled={locked}>
        <legend className="funnel__edge-tools-title">Traçado</legend>
        {(
          [
            ["curva", "Curva"],
            ["reta", "Reta"],
            ["cotovelo", "Cotovelo"],
            ["livre", "Livre"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="funnel__ltb-btn"
            data-on={(style.forma ?? "curva") === value || undefined}
            aria-pressed={(style.forma ?? "curva") === value}
            onClick={() => onStyle({ forma: value })}
          >
            {label}
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={Boolean(style.tracejada)}
            onChange={(e) => onStyle({ tracejada: e.target.checked })}
          />
          Tracejada
        </label>
      </fieldset>
      <fieldset className="funnel__edge-tools-group" disabled={locked}>
        <legend className="funnel__edge-tools-title">Espessura</legend>
        {(
          [
            [1, "fina"],
            [2, "média"],
            [3, "grossa"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="funnel__ltb-btn"
            aria-label={`Espessura ${label}`}
            aria-pressed={(style.espessura ?? 2) === value}
            data-on={(style.espessura ?? 2) === value || undefined}
            onClick={() => onStyle({ espessura: value })}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <fieldset
        className="funnel__edge-tools-group funnel__ltb-cores"
        disabled={locked}
      >
        <legend className="funnel__edge-tools-title">Cor</legend>
        <button
          type="button"
          className="funnel__ltb-btn"
          aria-pressed={!style.cor}
          data-on={!style.cor || undefined}
          onClick={() => onStyle({ cor: undefined })}
        >
          Automática
        </button>
        {COLORS.map((value) => (
          <button
            key={value}
            type="button"
            className="funnel__ltb-cor"
            style={{ background: value }}
            aria-label={`Cor ${value}`}
            aria-pressed={style.cor?.toLowerCase() === value.toLowerCase()}
            data-on={
              style.cor?.toLowerCase() === value.toLowerCase() || undefined
            }
            onClick={() => onStyle({ cor: value })}
          />
        ))}
        <label className="funnel__edge-custom-color">
          Personalizada
          <input
            type="color"
            aria-label="Cor da linha"
            value={color}
            onChange={(e) => onStyle({ cor: e.target.value })}
          />
        </label>
      </fieldset>
      <fieldset className="funnel__edge-tools-group" disabled={locked}>
        <legend className="funnel__edge-tools-title">Setas</legend>
        {(
          [
            ["fim", "No fim"],
            ["ambas", "Nas duas pontas"],
            ["nenhuma", "Sem seta"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="funnel__ltb-btn"
            aria-pressed={(style.pontas ?? "fim") === value}
            data-on={(style.pontas ?? "fim") === value || undefined}
            onClick={() => onStyle({ pontas: value })}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <fieldset className="funnel__edge-tools-group" disabled={locked}>
        <legend className="funnel__edge-tools-title">Fluxo</legend>
        <label>
          <input
            type="checkbox"
            aria-label="Animar fluxo desta linha"
            checked={flowEnabled}
            onChange={(e) => onStyle({ fluxo: e.target.checked })}
          />
          Animar esta linha
        </label>
        <button
          type="button"
          className="funnel__ltb-btn"
          aria-pressed={flowGlobal}
          data-on={flowGlobal || undefined}
          onClick={onGlobalFlow}
        >
          {flowGlobal ? "Desligar fluxo geral" : "Ligar fluxo geral"}
        </button>
      </fieldset>
      <div className="funnel__edge-tools-actions">
        <button
          type="button"
          className="funnel__ltb-btn"
          disabled={locked}
          onClick={onReset}
        >
          <RotateCcw size={16} />
          Redefinir linha
        </button>
        <button
          type="button"
          className="funnel__ltb-btn"
          disabled={locked}
          onClick={onDelete}
        >
          <Trash2 size={16} />
          Apagar linha
        </button>
      </div>
    </div>
  );
}
