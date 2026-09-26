"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/*
  O painel do globo ao vivo na cara do design aether-node-dashboard
  (aura): globo point-cloud monocromático num card de vidro escuro, com
  marquees de telemetria, leituras AZIMUTH/ELEVATION e o rótulo
  "INTERACTIVE PROJECTION". O globo é WebGL (three.js) e entra só no
  browser; sem pontos reais, roda o feed simulado sozinho.
*/

const LiveGlobe = dynamic(
  () => import("./live-globe").then((m) => m.LiveGlobe),
  {
    ssr: false,
    loading: () => (
      <span className="aeg__loading" aria-hidden>
        Inicializando…
      </span>
    ),
  },
);

const TELEMETRIA_TOPO = [
  "SYSTEM_NOMINAL: TRUE",
  "LATENCY: 12MS",
  "PACKET_LOSS: 0.01%",
  "ALLOCATING_RESOURCES",
  "SECTOR_7: SCANNED",
];
const TELEMETRIA_BASE = [
  "IDLE_STATE",
  "WAITING_FOR_INPUT",
  "SENSORS: ONLINE",
  "MESH_SYNC: OK",
];

function Marquee({ items, dim }: { items: string[]; dim?: boolean }) {
  const linha = (
    <div className="aeg__marquee-row" aria-hidden={dim}>
      {items.map((t, i) => (
        <React.Fragment key={i}>
          <span>{t}</span>
          <span className="aeg__marquee-dot" />
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <div className="aeg__marquee" data-dim={dim || undefined}>
      <div className="aeg__marquee-track">
        {linha}
        {linha}
      </div>
    </div>
  );
}

export function LiveGlobePanel({ demo = false }: { demo?: boolean }) {
  const azimuteRef = React.useRef<HTMLSpanElement>(null);
  const elevacaoRef = React.useRef<HTMLSpanElement>(null);

  // Telemetria decorativa: o azimute gira devagar, a elevação oscila.
  // Atualiza o DOM direto, sem re-render do React.
  React.useEffect(() => {
    let raf = 0;
    let az = 227;
    const passo = () => {
      az = (az + 0.15) % 360;
      const el = 12 + Math.sin(az / 30) * 8;
      if (azimuteRef.current)
        azimuteRef.current.textContent = String(Math.round(az)).padStart(3, "0");
      if (elevacaoRef.current)
        elevacaoRef.current.textContent = String(Math.round(el)).padStart(3, "0");
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="aeg" aria-label="Globo ao vivo">
      <div className="aeg__grid" aria-hidden />
      <header className="aeg__head">
        <div>
          <h3 className="aeg__title">Matriz global de eventos</h3>
          <p className="aeg__sub">
            A malha de visitantes ao vivo, sincronizada na superfície do mundo.
          </p>
        </div>
        <span className="aeg__rel">{demo ? "demo-1.4.2" : "rel-1.4.2"}</span>
      </header>

      <div className="aeg__display">
        <Marquee items={TELEMETRIA_TOPO} />

        <div className="aeg__stage">
          <LiveGlobe className="aeg__canvas" />
        </div>

        <div className="aeg__read aeg__read--tl" aria-hidden>
          <span className="aeg__read-line" />
          <span className="aeg__read-label">
            AZIMUTH: <span ref={azimuteRef} className="aeg__read-val">227</span>
          </span>
        </div>
        <div className="aeg__read aeg__read--br" aria-hidden>
          <span className="aeg__read-line" />
          <span className="aeg__read-label">
            ELEVATION:{" "}
            <span ref={elevacaoRef} className="aeg__read-val">012</span>
          </span>
        </div>

        <div className="aeg__proj" aria-hidden>
          Interactive Projection
        </div>

        <Marquee items={TELEMETRIA_BASE} dim />
      </div>

      <footer className="aeg__foot">
        {demo
          ? "Pontos simulados — conecte o banco para ver as sessões reais girando no globo."
          : "Cada ponto é um visitante online agora; os arcos são novas visitas chegando."}
      </footer>
    </section>
  );
}
