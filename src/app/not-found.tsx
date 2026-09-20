import Link from "next/link";

/**
 * Página não encontrada, no mesmo preto fosco e blocos do painel.
 * Vale para qualquer endereço que não exista.
 */
export default function NotFound() {
  return (
    <main className="dash-skin bg-background text-foreground flex min-h-svh w-full items-center justify-center p-6">
      <section className="sessao w-full max-w-xl" style={{ minHeight: "auto" }}>
        <header className="sessao-cabecalho">
          <span className="sessao-numero">404</span>
          <div className="sessao-titulo">
            <h1 className="text-[0.9375rem] font-bold">Página não encontrada</h1>
            <p>O endereço não existe ou foi movido.</p>
          </div>
        </header>
        <div className="sessao-corpo sessao-corpo-bloco">
          <Link
            href="/dashboard"
            className="inline-flex min-h-9 items-center bg-white px-4 text-xs font-bold text-[#121212] hover:bg-[#e6e6e6]"
          >
            Ir para o painel
          </Link>
        </div>
      </section>
    </main>
  );
}
