import { Zap } from "lucide-react";

import { brand } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const configured = isSupabaseConfigured();

  return (
    <div className="dash-skin bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <Zap className="size-5" />
        </div>
        <span className="text-xl font-bold tracking-tight">{brand.name}</span>
      </Link>

      <div className="w-full max-w-sm space-y-4">
        {!configured && (
          <Alert variant="info">
            <Info />
            <AlertTitle>Modo demonstração</AlertTitle>
            <AlertDescription>
              O Supabase ainda não foi configurado, então o login real está
              indisponível. Você pode{" "}
              <Link href="/dashboard" className="font-medium underline">
                abrir o painel em modo demonstração
              </Link>{" "}
              ou configurar as variáveis no arquivo .env (ver docs/DEPLOY.md).
            </AlertDescription>
          </Alert>
        )}
        {children}
      </div>

      <p className="text-muted-foreground text-xs">
        {brand.name} — {brand.tagline}
      </p>
    </div>
  );
}
