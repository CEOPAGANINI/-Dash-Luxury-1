import type { Metadata } from "next";

import { OfferRouterPanel } from "@/features/offer-router/offer-router-panel";

export const metadata: Metadata = { title: "Roteador de ofertas" };

/**
 * O Roteador de ofertas — só a interface, a pedido do dono: configura para
 * onde parte dos visitantes de uma página é mandada (por região, aparelho
 * ou fatia), lista só as páginas com redirecionamento, mostra de onde vêm
 * os visitantes e quem foi redirecionado. Nada roteia de verdade.
 */
export default function RoteadorDeOfertasPage() {
  return (
    <>
      <h1 className="sr-only">Roteador de ofertas</h1>
      <OfferRouterPanel />
    </>
  );
}
