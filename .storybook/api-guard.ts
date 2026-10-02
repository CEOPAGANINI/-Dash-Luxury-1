/* The catalogue demonstrates UI locally. Never call the app's live API. */
if (typeof window !== "undefined") {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input);
    const url = new URL(address, window.location.href);
    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({
          ok: false,
          erro: "O Storybook não está conectado à API. Este exemplo não salva nem publica dados da conta.",
          message: "API indisponível no catálogo de componentes.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    return nativeFetch(input, init);
  };
}

export {};
