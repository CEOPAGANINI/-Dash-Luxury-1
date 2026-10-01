"use client";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          background: "#050505",
          color: "#fff",
          fontFamily: "system-ui",
          margin: 0,
          padding: "32px",
        }}
      >
        <main role="alert">
          <h1>Não foi possível abrir o painel</h1>
          <p>
            O serviço está indisponível neste momento. Seu conteúdo não foi
            apagado.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "12px 20px",
              border: "1px solid #fff",
              background: "#fff",
              color: "#000",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
