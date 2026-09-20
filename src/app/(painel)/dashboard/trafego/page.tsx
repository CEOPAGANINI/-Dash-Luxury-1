import type { Metadata } from "next";

import { getSession } from "@/lib/auth/session";
import { DashboardCanvas } from "@/features/dashboard/layout-canvas";

export const metadata: Metadata = { title: "Gestão de Tráfego" };

/**
 * Gestão de tráfego: o que cada canal gasta e traz de volta.
 *
 * Os blocos vêm do registro central e são desenhados pelo canvas, que
 * também permite reorganizá-los no modo "Organizar".
 *
 * A página começa direto nos painéis. Saíram daqui, a pedido:
 *
 * - o cabeçalho com o título e a descrição — a página já se identifica na aba
 *   do navegador e na barra de navegação, onde "Tráfego" fica destacado;
 * - a barra de contexto com operação, data ativa, estado e "limpar filtros" —
 *   ela continua nas outras páginas do painel, e aqui a data quem manda é o
 *   dia clicado no calendário, e a rede, as caixas coloridas dentro dele.
 *
 * O aviso de dados fictícios continua no banner do topo do painel, que
 * aparece em todas as páginas enquanto o modo demonstração estiver ligado.
 */
export default async function TrafegoPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  return <DashboardCanvas area="trafego" demoMode={demoMode} />;
}
