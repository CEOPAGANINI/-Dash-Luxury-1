import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ExternalLink, Info, PanelsTopLeft } from "lucide-react";

import {
  alphaGamerNebula,
  techNebulaStore,
} from "@/features/landing/technebula-data";
import { formatMoney } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Landing pages" };

export default function LandingPagesPage() {
  const lp = alphaGamerNebula;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Landing pages</h2>
          <p className="text-muted-foreground text-sm">
            Páginas publicadas e configuração da jornada da sua loja.
          </p>
        </div>
        <Button asChild>
          <Link href="/editor/landing-page">
            <PanelsTopLeft /> Abrir editor de páginas
          </Link>
        </Button>
      </div>

      <Alert variant="info">
        <Info />
        <AlertDescription>
          Use o editor visual para configurar conteúdos, destinos e ligações. Os
          rascunhos ficam neste navegador e podem ser exportados em JSON. Salvar
          no editor não altera as páginas publicadas abaixo.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="justify-between">
          <CardHeader>
            <PanelsTopLeft className="mb-5 size-8" strokeWidth={1.5} />
            <CardTitle>Seu espaço de páginas</CardTitle>
            <CardDescription>
              Organize landing pages, checkout e páginas de obrigado em um fluxo
              visual. Configure cada etapa e teste as ligações na prévia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Badge variant="muted">Rascunho local · Orbit</Badge>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/editor/landing-page">
                Configurar meu fluxo <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="gap-3 overflow-hidden py-0 pb-5">
          <div className="bg-muted relative aspect-[16/9] w-full overflow-hidden border-b">
            <Image
              src={lp.mainImage}
              alt={lp.name}
              fill
              className="object-contain p-4"
            />
          </div>
          <CardHeader className="px-5">
            <CardTitle className="text-base">{lp.name}</CardTitle>
            <CardDescription>
              Loja: {techNebulaStore.name} ·{" "}
              {formatMoney(lp.priceCents, lp.currency, "pt-PT")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 px-5">
            <Badge variant="success">Publicada</Badge>
            <Badge variant="muted">estática (código)</Badge>
            <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
              /p/{lp.slug}
            </code>
            <div className="mt-2 flex w-full gap-2">
              <Button size="sm" asChild>
                <Link href={`/p/${lp.slug}`} target="_blank">
                  <ExternalLink /> Abrir página
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
