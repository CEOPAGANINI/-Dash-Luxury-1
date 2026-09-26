"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/*
  O painel do globo ao vivo, na pele do design aether-node-dashboard:
  moldura escura, acento verde, barra de topo com o ponto "ao vivo". O
  globo é WebGL (three.js) e entra só no browser, fora do bundle inicial.
  Sem pontos reais, ele mostra o feed simulado sozinho.
*/

const LiveGlobe = dynamic(
  () => import("./live-globe").then((m) => m.LiveGlobe),
  {
    ssr: false,
    loading: () => <div className="lvg__skeleton" aria-hidden />,
  },
);

export function LiveGlobePanel({ demo = false }: { demo?: boolean }) {
  return (
    <section className="lvg" aria-label="Globo ao vivo">
      <header className="lvg__top">
        <span className="lvg__brand">
          <span className="lvg__brand-ico" aria-hidden>
            ◍
          </span>
          Aether · Ao vivo no mundo
        </span>
        <span className="lvg__live">
          <i aria-hidden />
          {demo ? "demonstração" : "ao vivo"}
        </span>
      </header>
      <div className="lvg__stage">
        <LiveGlobe className="lvg__canvas" />
      </div>
      <footer className="lvg__foot">
        {demo
          ? "Pontos simulados — conecte o banco para ver as sessões reais girando no globo."
          : "Cada ponto verde é um visitante online agora; os arcos são novas visitas chegando."}
      </footer>
    </section>
  );
}
