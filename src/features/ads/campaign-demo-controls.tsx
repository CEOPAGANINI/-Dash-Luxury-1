"use client";

import { useState } from "react";
import Link from "next/link";
import { resetCampaignDemo, useCampaignDemo } from "./demo-store";

export function CampaignDemoControls({ page }: { page: string }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const { notice } = useCampaignDemo();
  return (
    <div className="campaign-demo-controls">
      <div className="campaign-toolbar">
        <button
          className="campaign-control"
          onClick={() => setConfirmReset(true)}
        >
          Restaurar exemplos
        </button>
        <Link
          className="campaign-control"
          href={`/campanhas/${page}?modo=real`}
          prefetch={false}
        >
          Consultar dados reais
        </Link>
      </div>
      {confirmReset && (
        <div
          role="group"
          aria-label="Confirmar restauração"
          className="campaign-demo-confirm"
        >
          <p>
            Descartar seus testes locais e restaurar as 12 campanhas de exemplo
            nas três redes? Os dados reais não serão alterados.
          </p>
          <div className="campaign-toolbar">
            <button
              className="campaign-control"
              onClick={() => {
                resetCampaignDemo();
                setConfirmReset(false);
              }}
            >
              Confirmar restauração
            </button>
            <button
              className="campaign-control"
              onClick={() => setConfirmReset(false)}
            >
              Cancelar restauração
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="campaign-note">
          {notice}
        </p>
      )}
    </div>
  );
}
