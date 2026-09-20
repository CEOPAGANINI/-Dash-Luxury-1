import type { Metadata } from "next";

import { isDatabaseConfigured } from "@/database/client";
import { oauthAvailability } from "@/features/integrations/connections-store";
import {
  DataConnections,
  type AvisoOauth,
} from "@/features/integrations/data-connections";
import { IntegrationsDashboard } from "@/features/unified-dashboard/business-modules";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

const RESULTADOS = new Set(["ok", "cancelado", "state", "erro"]);

/**
 * Integrações: primeiro o que precisa ser conectado (as fontes de dados que
 * alimentam o painel — redes de anúncio, gateway e loja), depois o módulo
 * demonstrativo com o estado das integrações da Dash 5.0.
 *
 * As rotas de OAuth voltam para cá com ?oauth=meta&resultado=ok; a placa
 * mostra o resultado em uma linha.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const provider = searchParams.oauth;
  const resultado = searchParams.resultado;
  const aviso: AvisoOauth | undefined =
    (provider === "meta" || provider === "google") &&
    typeof resultado === "string" &&
    RESULTADOS.has(resultado)
      ? { provider, resultado: resultado as AvisoOauth["resultado"] }
      : undefined;

  return (
    <div className="space-y-4">
      <DataConnections
        oauth={oauthAvailability()}
        bancoConfigurado={isDatabaseConfigured()}
        aviso={aviso}
      />
      <IntegrationsDashboard />
    </div>
  );
}
