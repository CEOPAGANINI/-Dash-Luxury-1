"use client";

import type { DemoTrafficSettings } from "./meta-traffic-demo";
import styles from "./meta-business-panel.module.css";

export function MetaDemoSettings({
  settings,
  onChange,
  onReset,
}: {
  settings: DemoTrafficSettings;
  onChange: (settings: DemoTrafficSettings) => void;
  onReset: () => void;
}) {
  const update = (patch: Partial<DemoTrafficSettings>) =>
    onChange({ ...settings, ...patch });
  return (
    <details className={styles.settings}>
      <summary>Configurações da demonstração</summary>
      <p>
        Experimente as configurações abaixo. O orçamento e os limites de alerta
        atualizam os resultados simulados nesta prévia.
      </p>
      <div className={styles.filters}>
        <label>
          Orçamento diário por conta (R$)
          <input
            type="number"
            min="10"
            max="100000"
            step="10"
            value={settings.dailyBudget}
            onChange={(e) =>
              update({
                dailyBudget: Math.max(
                  10,
                  Math.min(100000, Number(e.target.value) || 10),
                ),
              })
            }
          />
        </label>
        <label>
          ROAS mínimo
          <input
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            value={settings.minimumRoas}
            onChange={(e) =>
              update({
                minimumRoas: Math.max(
                  0.1,
                  Math.min(50, Number(e.target.value) || 0.1),
                ),
              })
            }
          />
        </label>
        <label>
          CPA máximo (R$)
          <input
            type="number"
            min="1"
            max="10000"
            value={settings.maximumCpa}
            onChange={(e) =>
              update({
                maximumCpa: Math.max(
                  1,
                  Math.min(10000, Number(e.target.value) || 1),
                ),
              })
            }
          />
        </label>
        <label>
          Atualização simulada
          <select
            value={settings.syncMinutes}
            onChange={(e) => update({ syncMinutes: Number(e.target.value) })}
          >
            <option value="5">A cada 5 minutos</option>
            <option value="15">A cada 15 minutos</option>
            <option value="60">A cada hora</option>
          </select>
        </label>
        <label>
          Janela de atribuição
          <select
            value={settings.attribution}
            onChange={(e) =>
              update({
                attribution: e.target
                  .value as DemoTrafficSettings["attribution"],
              })
            }
          >
            <option value="7d_click_1d_view">
              7 dias clique / 1 dia visualização
            </option>
            <option value="1d_click">1 dia clique</option>
          </select>
        </label>
        <label>
          Moeda e fuso
          <select value="BRL" disabled>
            <option value="BRL">BRL · América/São Paulo</option>
          </select>
        </label>
      </div>
      <div className={styles.businesses}>
        {(
          [
            ["pixel", "Pixel e eventos do navegador"],
            ["conversionsApi", "API de Conversões e deduplicação"],
            ["utm", "UTMs por campanha, conjunto e anúncio"],
            ["alerts", "Alertas de desempenho"],
          ] as const
        ).map(([key, label]) => (
          <label className={styles.check} key={key}>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(e) => update({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <p className={styles.note}>
        A frequência e a janela são exemplos de configuração; não executam uma
        sincronização automática. As opções não alteram o Meta nem o
        rastreamento da loja real.
      </p>
      <button type="button" onClick={onReset}>
        Restaurar demonstração
      </button>
    </details>
  );
}
