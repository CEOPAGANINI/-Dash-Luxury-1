import type { Metadata } from "next";

import { isDatabaseConfigured } from "@/database/client";
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
          Quem está na sua loja agora, girando no globo — de onde vêm os
          visitantes ao vivo
        </p>
      </div>

      {/* Só o globo. Sem banco, mostra o feed simulado. */}
      <LiveGlobePanel demo={!temBanco} />
    </div>
  );
}
