import type { Metadata } from "next";

import { AccessFilterPanel } from "@/features/access-filter/access-filter-panel";

export const metadata: Metadata = { title: "Filtro de acesso" };

/**
 * O Filtro de acesso — só a interface, a pedido do dono: monta uma regra
 * honesta de quem pode ver o site (país e aparelho) e simula quem entra.
 * A regra vale igual para todos; não serve para enganar a revisão de
 * anúncio. Nada aqui liga a regra em servidor.
 */
export default function FiltroDeAcessoPage() {
  return (
    <>
      {/* O h1 fica só para leitor de tela; o card já traz o nome. */}
      <h1 className="sr-only">Filtro de acesso</h1>
      <AccessFilterPanel />
    </>
  );
}
