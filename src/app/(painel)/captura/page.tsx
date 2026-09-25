import type { Metadata } from "next";

import { CapturePanel } from "@/features/capture/capture-panel";

export const metadata: Metadata = { title: "Baixar site" };

/**
 * O Asimov Site Downloader — só a interface, a pedido do dono: cola o
 * endereço de uma página e vê o fluxo de baixar uma cópia para arquivar
 * páginas suas. Nada é buscado nem baixado; a tela avisa que é demonstração.
 */
export default function CapturaPage() {
  return (
    <>
      {/* O h1 da rota fica só para leitor de tela; o card já traz o nome. */}
      <h1 className="sr-only">Baixar site</h1>
      <CapturePanel />
    </>
  );
}
