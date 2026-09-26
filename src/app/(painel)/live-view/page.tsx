import type { Metadata } from "next";

import { isDatabaseConfigured } from "@/database/client";
import { LiveView } from "@/features/analytics/live-view";
import { LiveGlobePanel } from "@/features/analytics/live-globe-panel";

export const metadata: Metadata = { title: "Live View" };
export const dynamic = "force-dynamic";

export default function LiveViewPage() {
  const temBanco = isDatabaseConfigured();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Live View</h2>
        <p className="text-muted-foreground text-sm">
          Quem está na sua loja agora, girando no globo — de onde vêm e onde
          estão no funil
        </p>
      </div>

      {/* O globo aparece sempre; sem banco, mostra o feed simulado. */}
      <LiveGlobePanel demo={!temBanco} />

      {temBanco ? (
        <LiveView />
      ) : (
        <p className="text-muted-foreground text-sm">
          Conecte o Supabase para ver as sessões reais e a lista ao vivo — o
          globo acima está em modo demonstração.
        </p>
      )}
    </div>
  );
}
