import { paginaVazia, type DadosPagina, type FunnelNode } from "./funnel-model";

const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f-\u009f]/;

/** Only explicit HTTP(S) URLs or same-origin root-relative paths may navigate. */
export function normalizeFunnelAddress(value?: string): string | null {
  const address = value?.trim();
  if (!address || UNSAFE_CHARACTERS.test(address)) return null;
  try {
    if (UNSAFE_CHARACTERS.test(decodeURIComponent(address))) return null;
  } catch {
    return null;
  }
  if (/^\/%(?:2f|5c)/i.test(address)) return null;
  if (address.startsWith("/") && !address.startsWith("//")) {
    try {
      const parsed = new URL(address, "https://funnel.invalid");
      if (parsed.origin !== "https://funnel.invalid") return null;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(address)) return null;
  try {
    const parsed = new URL(address);
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Domain settings accept a bare hostname, but not credentials, paths or schemes other than HTTP(S). */
function domainOrigin(value: string): string | null {
  const domain = value.trim();
  if (
    !domain ||
    /\s/.test(domain) ||
    domain.startsWith("/") ||
    UNSAFE_CHARACTERS.test(domain)
  )
    return null;
  const candidate = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const safe = normalizeFunnelAddress(candidate);
  if (!safe) return null;
  const parsed = new URL(safe);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
  return parsed.origin;
}

/** The same canonical URL is used by previews, destinations and publication. */
export function pageAddress(
  page: Pick<DadosPagina, "dominio" | "caminho">,
): string | null {
  const path = page.caminho.trim() || "/";
  // The path field cannot replace its configured origin with a URL or protocol-relative address.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return null;
  const safePath = normalizeFunnelAddress(
    path.startsWith("/") ? path : `/${path}`,
  );
  if (!safePath) return null;
  if (!page.dominio?.trim()) return safePath;
  const origin = domainOrigin(page.dominio);
  return origin ? `${origin}${safePath}` : null;
}

export function funnelNodeAddress(node: FunnelNode): string {
  if (node.type === "store" && node.loja?.dominio?.trim()) {
    // A configured, invalid destination must not silently fall back to a stale URL.
    return pageAddress({ dominio: node.loja.dominio, caminho: "/" }) ?? "";
  }
  if (node.pagina) return pageAddress(node.pagina) ?? "";
  const legacy = normalizeFunnelAddress(node.url);
  if (legacy) return legacy;
  const slug = node.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `/${slug || encodeURIComponent(node.id)}`;
}

/** Editing an older node must not silently replace its existing public address. */
export function pageSettingsForNode(node: FunnelNode): DadosPagina {
  if (node.pagina) return node.pagina;
  const address = funnelNodeAddress(node);
  const parsed = new URL(address, "https://funnel.invalid");
  return {
    ...paginaVazia(),
    caminho: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    ...(address.startsWith("http") ? { dominio: parsed.origin } : {}),
  };
}
