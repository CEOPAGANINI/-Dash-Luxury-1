"use client";

export default function CampaignError({ reset }: { reset: () => void }) {
  return (
    <div className="campaign-empty" role="alert">
      <h1>Não foi possível carregar esta página</h1>
      <p>Tente novamente. Nenhuma campanha foi alterada.</p>
      <button className="campaign-control" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
