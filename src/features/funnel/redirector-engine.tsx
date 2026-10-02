"use client";

import * as React from "react";
import { redirectorCampaignAddress } from "./redirector-address";
import styles from "./redirector-engine.module.css";

export function RedirectorEngine({ address, campaignId, onCampaignChange }: {
  address: string | null;
  campaignId?: string;
  onCampaignChange: (id: string | undefined) => void;
}) {
  const [version, setVersion] = React.useState(0);
  if (!address) {
    return (
      <section className={styles.empty} aria-label="Painel completo do redirecionador">
        <span className={styles.symbol} aria-hidden>↗</span>
        <h2>Painel completo do redirecionador</h2>
        <p>Domínios, destinos, fluxos e registros ficam aqui, dentro do funil.</p>
        <p role="status">Aguardando a conexão com a hospedagem do redirecionador.</p>
        <small>Enquanto isso, você pode preparar as regras e testar os destinos nas outras abas.</small>
      </section>
    );
  }
  const source = redirectorCampaignAddress(address, campaignId);
  return (
    <section className={styles.engine} aria-label="Painel completo do redirecionador">
      <div className={styles.toolbar}>
        <span>Domínios · Destinos · Fluxos · Registros</span>
        <button type="button" onClick={() => setVersion((v) => v + 1)}>Recarregar</button>
        <a href={source} target="_blank" rel="noopener noreferrer">Abrir em nova aba ↗</a>
      </div>
      <label className={styles.campaign}>
        Campanha vinculada a este bloco
        <input
          type="text"
          inputMode="numeric"
          value={campaignId ?? ""}
          placeholder="Todas as campanhas"
          aria-label="Número da campanha vinculada"
          maxLength={12}
          onChange={(event) => {
            const value = event.target.value.trim();
            if (!value || /^[1-9]\d{0,11}$/.test(value)) onCampaignChange(value || undefined);
          }}
        />
      </label>
      <iframe
        key={version}
        className={styles.frame}
        src={source}
        title="Administração do redirecionador YellowTDS"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />
      <p className={styles.hint}>Crie ou escolha uma campanha no painel e vincule seu número a este bloco. Entre com sua conta do redirecionador; se o painel não aparecer, abra em nova aba.</p>
    </section>
  );
}

