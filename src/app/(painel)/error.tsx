"use client";
import Link from "next/link";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="mx-auto grid max-w-2xl gap-4 border bg-card p-6"
    >
      <h1 className="text-xl font-semibold">Esta área não pôde carregar</h1>
      <p className="text-sm text-muted-foreground">
        Seus dados não foram apagados. Pode ser uma sessão expirada, falta de
        permissão ou indisponibilidade do banco. O quadro não ficará vazio sem
        explicação.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="border bg-primary px-4 py-2 text-primary-foreground"
        >
          Tentar novamente
        </button>
        <Link className="border px-4 py-2" href="/configuracoes/diagnosticos">
          Abrir diagnóstico
        </Link>
        <Link className="border px-4 py-2" href="/login">
          Entrar novamente
        </Link>
      </div>
    </section>
  );
}
