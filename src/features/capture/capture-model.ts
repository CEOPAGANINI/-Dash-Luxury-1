/*
  O modelo da captura de páginas (Asimov Site Downloader): valida a URL,
  monta o nome do arquivo e lê o título de um HTML. Tudo puro, para o
  teste não depender de rede. A tela é só demonstração — nenhuma busca
  roda; quando for ligada, a busca precisa de trava de SSRF no servidor.

  A ferramenta é para arquivar/guardar uma cópia de páginas suas ou que
  você tem direito de copiar. Ela captura o HTML da página; imagens e
  estilos continuam apontando para o site original.
*/

export interface UrlValida {
  ok: true;
  url: URL;
  host: string;
  https: boolean;
}
export interface UrlInvalida {
  ok: false;
  motivo: string;
}

/** Aceita só http/https, com host, e recusa endereços locais óbvios pelo nome. */
export function validarUrl(entrada: string): UrlValida | UrlInvalida {
  const texto = entrada.trim();
  if (!texto) return { ok: false, motivo: "Cole o endereço de uma página." };
  // Um esquema que não seja http/https é recusado (não vira https://ftp://…);
  // sem esquema nenhum, assume https.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(texto) && !/^https?:\/\//i.test(texto))
    return { ok: false, motivo: "Só http e https." };
  const comEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return { ok: false, motivo: "Endereço inválido." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, motivo: "Só http e https." };
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    host.startsWith("127.") ||
    host.startsWith("0.")
  )
    return { ok: false, motivo: "Endereços locais não podem ser capturados." };
  return { ok: true, url, host, https: url.protocol === "https:" };
}

/** Um nome de arquivo seguro a partir do host e do caminho da página. */
export function nomeDoArquivo(url: URL, extensao: "html" | "zip"): string {
  const caminho = url.pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .pop();
  const base = `${url.hostname}${caminho ? `-${caminho}` : ""}`
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "captura"}.${extensao}`;
}

/** O título da página, tirado do <title> do HTML capturado. */
export function tituloDaPagina(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 200) : "";
}
