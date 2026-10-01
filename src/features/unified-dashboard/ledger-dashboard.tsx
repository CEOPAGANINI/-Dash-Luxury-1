"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { useUnifiedDashboard } from "./operation-provider";

export function LedgerDashboard() {
  const { data } = useUnifiedDashboard();
  const currency = data.source.currency ?? "BRL";
  const timeZone = data.source.timeZone ?? "America/Sao_Paulo";
  const money = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
      value,
    );
  const date = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleString("pt-BR", {
          timeZone,
          dateStyle: "short",
          timeStyle: "short",
        });
  };
  const incoming = data.transactions
    .filter((entry) => entry.type === "entrada")
    .reduce((sum, entry) => sum + entry.value, 0);
  const outgoing = data.transactions
    .filter((entry) => entry.type === "saida")
    .reduce((sum, entry) => sum + entry.value, 0);
  return (
    <div className="min-w-0 space-y-4">
      <header className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Entradas e saídas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Livro-caixa registrado · {currency} · {timeZone}
        </p>
      </header>
      {data.source.status !== "ready" ? (
        <section role="status" className="space-y-3 border bg-card p-5">
          <p>
            {data.source.status === "error"
              ? "A consulta ao livro-caixa falhou. Seus registros não foram apagados; recarregue para tentar novamente."
              : "Conecte o banco para consultar o livro-caixa. Valores indisponíveis não são apresentados como zero."}
          </p>
          <Button asChild variant="outline" className="rounded-none">
            <Link href="/configuracoes/diagnosticos">Ver diagnóstico</Link>
          </Button>
        </section>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Até 100 lançamentos confirmados, mais recentes primeiro, na moeda
            configurada. Totais apenas desta lista, não de todo o período.
            Outras moedas não são somadas. A diferença abaixo não representa
            saldo disponível no gateway.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Entradas na lista", incoming],
              ["Saídas na lista", outgoing],
              ["Diferença da lista", incoming - outgoing],
            ].map(([label, value]) => (
              <section
                key={String(label)}
                className="min-w-0 border bg-card p-4"
              >
                <h2 className="text-muted-foreground text-sm">{label}</h2>
                <p className="mt-2 break-words text-xl font-semibold tabular-nums">
                  {money(Number(value))}
                </p>
              </section>
            ))}
          </div>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Lançamentos confirmados</h2>
            <div
              className="max-w-full overflow-x-auto border"
              tabIndex={0}
              role="region"
              aria-label="Lançamentos do livro-caixa"
            >
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-card">
                  <tr>
                    {["Data", "Descrição", "Categoria", "Tipo", "Valor"].map(
                      (heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="border-b px-3 py-3 font-medium"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((entry, index) => (
                    <tr key={`${entry.date}:${index}`}>
                      <td className="border-b px-3 py-3 whitespace-nowrap">
                        {date(entry.date)}
                      </td>
                      <td className="max-w-sm border-b px-3 py-3 break-words">
                        {entry.description}
                      </td>
                      <td className="border-b px-3 py-3">{entry.category}</td>
                      <td className="border-b px-3 py-3">
                        {entry.type === "entrada" ? "Entrada" : "Saída"}
                      </td>
                      <td className="border-b px-3 py-3 whitespace-nowrap tabular-nums">
                        {entry.type === "entrada" ? "+ " : "− "}
                        {money(entry.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.transactions.length === 0 && (
              <p className="text-muted-foreground border p-4 text-sm">
                Nenhum lançamento confirmado em {currency} foi encontrado.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
