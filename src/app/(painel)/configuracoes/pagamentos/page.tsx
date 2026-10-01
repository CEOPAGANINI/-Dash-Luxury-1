import Link from "next/link";
import { getPaymentConsole } from "@/features/checkout/payment-console";
import { PaymentReconcileButton } from "@/features/checkout/payment-reconcile-button";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Pagamentos e conciliação · Dash Luxury" };

const labels: Record<string, string> = {
  created: "Preparado",
  pending: "Aguardando pagamento",
  processing: "Em confirmação",
  approved: "Pago",
  partially_refunded: "Estorno parcial",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Estornado",
  chargeback: "Contestado",
};
const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

export default async function PaymentConsolePage() {
  const data = await getPaymentConsole();
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pagamentos e conciliação</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Dados reais da sua conta. Consultar o gateway nunca inicia outra
            cobrança ou estorno.
          </p>
        </div>
        <Link href="/integracoes" className="text-sm underline">
          Configurar Broski
        </Link>
      </header>
      {!data.configured && (
        <p role="status" className="border p-4">
          Conecte o banco em Configurações → Diagnósticos para habilitar a
          operação.
        </p>
      )}
      <section
        aria-label="Resumo dos pagamentos"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          ["Aguardando confirmação", data.totals.pending],
          ["Resultado desconhecido", data.totals.unknown],
          ["Pagos", data.totals.paid],
        ].map(([label, value]) => (
          <div key={String(label)} className="border bg-card p-4">
            <p className="text-muted-foreground text-xs">{label}</p>
            <strong className="mt-2 block text-2xl">{value}</strong>
          </div>
        ))}
      </section>
      <section className="border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Últimos 50 pagamentos</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Sem ID do gateway, a consulta procura a referência nos 100 pedidos
            mais recentes. Ausência de resultado não autoriza nova cobrança.
          </p>
        </div>
        {!data.rows.length ? (
          <div className="space-y-2 p-6">
            <p>Nenhum pagamento registrado nesta conta.</p>
            <Link href="/editor/checkout" className="text-sm underline">
              Criar e configurar um checkout
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {["Pedido", "Estado", "Valor", "Verificação", "Ação"].map(
                    (label) => (
                      <th key={label} className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <p className="max-w-48 break-all font-mono text-xs">
                        {row.reference}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {date(row.createdAt)} · {row.method}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {labels[row.status] ?? row.status}
                      {row.unknown && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Confirmação pendente; não cobrar novamente
                        </p>
                      )}
                      {row.inventory === "reserved" && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Estoque reservado
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatMoney(row.amountCents, row.currency)}
                      {row.refundedAmountCents > 0 && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Devolvido:{" "}
                          {formatMoney(row.refundedAmountCents, row.currency)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.externalId
                        ? "Identificador confirmado"
                        : "Identificador ainda não confirmado"}
                      <p className="text-muted-foreground mt-1">
                        Atualizado {date(row.updatedAt)}
                      </p>
                    </td>
                    <td className="min-w-44 px-4 py-3">
                      {data.canReconcile ? (
                        <PaymentReconcileButton paymentId={row.id} />
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          Apenas proprietário, administrador ou financeiro pode
                          conciliar.
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section id="webhooks" className="border bg-card p-4">
        <h2 className="font-semibold">Últimos 20 eventos de webhook</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Apenas tipo, horário e processamento. Corpos e credenciais nunca são
          exibidos.
        </p>
        {!data.receipts.length ? (
          <p className="mt-4 text-sm">Nenhum evento recebido nesta conta.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {data.receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-xs"
              >
                <span className="font-mono">{receipt.type}</span>
                <span>{date(receipt.receivedAt)}</span>
                <span>
                  {!receipt.signatureValid
                    ? "Assinatura inválida"
                    : receipt.processedAt
                      ? "Processado"
                      : receipt.needsRetry
                        ? "Aguardando conciliação ou reenvio"
                        : "Recebido, aguardando processamento"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
