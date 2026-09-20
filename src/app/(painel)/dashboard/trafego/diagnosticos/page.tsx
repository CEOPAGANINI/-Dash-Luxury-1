import Link from "next/link";
import { TrafficDiagnostics } from "@/features/unified-dashboard/traffic-diagnostics";

export const metadata = { title: "Diagnósticos de aquisição" };

export default function AcquisitionDiagnosticsPage() {
  return (
    <div className="grid min-w-0 gap-4">
      <Link href="/dashboard/trafego" className="text-sm font-bold underline">
        Voltar à Aquisição
      </Link>
      <p className="text-muted-foreground text-sm">
        Análises complementares preservadas. Histórico detalhado de campanhas,
        eventos do funil e público ainda não integrado; nenhum resultado real é
        inferido dos indicadores consolidados.
      </p>
      <TrafficDiagnostics />
    </div>
  );
}
