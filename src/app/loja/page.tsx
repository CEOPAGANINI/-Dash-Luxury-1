import type { Metadata } from "next";
import Link from "next/link";
import { Store, ArrowLeft } from "lucide-react";

import { brand } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Loja" };

/**
 * Rota pública da loja. A vitrine completa (produtos, categorias, carrinho)
 * será construída na Fase 2.
 */
export default function LojaPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <EmptyState
        icon={Store}
        title={`Loja ${brand.name} — em construção`}
        description="A vitrine pública com produtos, categorias, busca e carrinho será publicada na Fase 2 do desenvolvimento."
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <ArrowLeft /> Voltar ao painel
            </Link>
          </Button>
        }
        className="w-full max-w-lg border-0"
      />
    </div>
  );
}
