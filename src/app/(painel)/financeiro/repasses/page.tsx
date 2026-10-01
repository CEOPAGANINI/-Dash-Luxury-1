import type { Metadata } from "next";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Repasses" };

export default function Page() {
  return (
    <div className="space-y-4">
      <header className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Repasses</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Aprovação de uma venda não significa dinheiro disponível para saque.
        </p>
      </header>
      <section className="space-y-3 border bg-card p-5">
        <h2 className="text-lg font-semibold">
          Consulta de repasses indisponível
        </h2>
        <p className="text-muted-foreground text-sm">
          O painel ainda não consulta o calendário de repasses, o saldo
          disponível nem o histórico de saques do gateway. Nenhum saldo zero ou
          data prevista é apresentado como se tivesse sido confirmado.
        </p>
        <Button asChild variant="outline" className="min-h-11 rounded-none">
          <Link href="/configuracoes/pagamentos">Ver pagamentos e conexão</Link>
        </Button>
      </section>
    </div>
  );
}
