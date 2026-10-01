import Link from "next/link";
export const metadata = { title: "Descontos e cupons" };
export default function CuponsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Descontos e cupons</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          O valor cobrado precisa ser validado no servidor e conciliado com o
          pagamento.
        </p>
      </header>
      <section className="border bg-card p-5">
        <h2 className="font-semibold">Preço de venda do produto</h2>
        <p className="text-muted-foreground my-3 text-sm">
          Configure o preço real no catálogo. É esse valor que o checkout valida
          antes de iniciar o pagamento; mudar a moeda do relatório não converte
          preços.
        </p>
        <Link className="underline" href="/catalogo/produtos">
          Configurar produtos e preços →
        </Link>
      </section>
      <section className="border bg-card p-5">
        <h2 className="font-semibold">Cupom no checkout: ainda indisponível</h2>
        <p className="text-muted-foreground my-3 text-sm">
          Não há um motor de cupons com reserva e limite de uso integrado ao
          adaptador de pagamento. Por isso o campo foi removido do checkout:
          nenhum desconto é prometido sem alterar o valor real da cobrança.
        </p>
        <Link className="underline" href="/configuracoes/pagamentos">
          Verificar pagamentos e conciliação →
        </Link>
      </section>
    </div>
  );
}
