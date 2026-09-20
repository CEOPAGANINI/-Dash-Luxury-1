import Link from "next/link";

/**
 * Registro não encontrado dentro do painel (campanha, cliente…): aparece
 * com o menu e o restante do painel em volta.
 */
export default function PainelNotFound() {
  return (
    <section className="sessao" style={{ minHeight: "auto" }} aria-labelledby="nao-encontrado">
      <header className="sessao-cabecalho">
        <span className="sessao-numero">404</span>
        <div className="sessao-titulo">
          <h2 id="nao-encontrado" className="text-[0.9375rem] font-bold">Não encontrado</h2>
          <p>Este registro não existe, foi removido ou pertence a outro modo (demonstração ou banco).</p>
        </div>
      </header>
      <div className="sessao-corpo sessao-corpo-bloco flex flex-wrap gap-2">
        <Link href="/campanhas" className="inline-flex min-h-9 items-center bg-white px-4 text-xs font-bold text-[#121212] hover:bg-[#e6e6e6]">
          Campanhas
        </Link>
        <Link href="/dashboard" className="inline-flex min-h-9 items-center bg-white px-4 text-xs font-bold text-[#121212] hover:bg-[#e6e6e6]">
          Painel
        </Link>
      </div>
    </section>
  );
}
