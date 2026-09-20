import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Info } from "lucide-react";

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
            Páginas publicadas em /p/[slug]
          </p>
        </div>
      </div>

      <Alert variant="info">
        <Info />
        <AlertDescription>
          Esta landing page está publicada como página estática (definida em
          código, editável em src/features/landing/technebula-data.ts). O editor
          visual por blocos, com criação de novas páginas pelo painel, chega na
          Fase 8.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
