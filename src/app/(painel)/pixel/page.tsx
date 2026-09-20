import type { Metadata } from "next";
import { Database, Info, Radar, Power, Trash2 } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  listPixels,
  PIXEL_TYPE_INFO,
  type PixelType,
} from "@/features/pixels/queries";
import {
  deletePixelAction,
  togglePixelAction,
} from "@/features/pixels/actions";
import { PixelForm } from "@/features/pixels/pixel-form";
import { getAppUrl } from "@/lib/app-url";
import { alphaGamerNebula } from "@/features/landing/technebula-data";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Pixel" };
export const dynamic = "force-dynamic";

export default async function PixelPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para cadastrar e ativar pixels."
        className="min-h-[420px]"
      />
    );
  }

  const rows = await listPixels();
  const appUrl = getAppUrl();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Pixel</h2>
        <p className="text-muted-foreground text-sm">
          Rastreamento das suas landing pages e do checkout
        </p>
      </div>

      <Alert variant="info">
        <Info />
        <AlertTitle>Como os eventos disparam</AlertTitle>
        <AlertDescription>
          <p>
            <strong>PageView</strong> e <strong>ViewContent</strong> na landing
            page · <strong>InitiateCheckout</strong> ao abrir o checkout ·{" "}
            <strong>Purchase</strong> apenas quando o Broski confirma o
            pagamento (nunca antes) — essencial no Multibanco, que o cliente
            paga dias depois.
          </p>
        </AlertDescription>
      </Alert>

      <PixelForm />

      <div>
        <h3 className="mb-3 text-sm font-semibold">Pixels cadastrados</h3>
        {rows.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="Nenhum pixel cadastrado"
            description="Adicione o seu Meta Pixel acima para começar a rastrear as visitas e conversões da sua landing page."
            className="min-h-[240px]"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((p) => (
              <Card key={p.id} className="gap-3 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="text-sm">{p.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {PIXEL_TYPE_INFO[p.type as PixelType]?.label ?? p.type}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.isActive ? "success" : "muted"}>
                      {p.isActive ? "Ativo" : "Desativado"}
                    </Badge>
                    <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
                      {p.pixelId}
                    </code>
                    {p.hasToken && <Badge variant="info">Token guardado</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <form action={togglePixelAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={String(!p.isActive)}
                      />
                      <Button size="sm" variant="outline" type="submit">
                        <Power />
                        {p.isActive ? "Desativar" : "Ativar"}
                      </Button>
                    </form>
                    <form action={deletePixelAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button size="sm" variant="ghost" type="submit">
                        <Trash2 /> Remover
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Páginas rastreadas</CardTitle>
          <CardDescription>
            Os pixels ativos são injetados automaticamente nestas páginas — não
            é preciso colar código em lugar nenhum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            {
              label: "Landing page",
              url: `${appUrl}/p/${alphaGamerNebula.slug}`,
            },
            {
              label: "Checkout",
              url: `${appUrl}/checkout/${alphaGamerNebula.slug}`,
            },
          ].map((p) => (
            <div
              key={p.url}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
            >
              <Badge variant="outline">{p.label}</Badge>
              <code className="text-muted-foreground font-mono text-xs break-all">
                {p.url}
              </code>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
