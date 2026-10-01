import {
  exportFlowPage,
  exportStaticFiles,
  type StaticPageExport,
} from "@/features/landing-editor/static-page-export";
import {
  importSiteFiles,
  type SiteFile,
} from "@/features/landing-editor/site-package";
import { contentFlowForPage } from "./content-flow";
import { normalizeFunnelAddress, pageAddress } from "./funnel-address";
import {
  TIPOS_PAGINA,
  type DadosPagina,
  type FunnelData,
  type FunnelNode,
} from "./funnel-model";
import { getPreparedPageZip } from "./page-zip";
import { nomeDoProduto } from "./store-model";
import { assertNoRedirectCycles, staticRedirectHtml } from "./static-redirect";

const encode = new TextEncoder();
const decode = new TextDecoder("utf-8", { fatal: true });
const html = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

/** Static routes cannot have ambiguous traversal, query strings or encoded slashes. */
export function staticRoute(value: string): string {
  const safe = normalizeFunnelAddress(value);
  if (
    !safe ||
    !safe.startsWith("/") ||
    safe.includes("?") ||
    safe.includes("#") ||
    /%(?:2e|2f|5c)/i.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error(
      `Caminho de página inválido: ${value}. Use / ou /nome-da-pagina.`,
    );
  let plain: string;
  try {
    plain = decodeURIComponent(safe);
  } catch {
    throw new Error("Caminho inválido.");
  }
  if (!/^\/(?:[\p{L}\p{N}_-]+\/)*[\p{L}\p{N}_-]*\/?$/u.test(plain))
    throw new Error(
      `“${value}” não é um caminho de diretório estático. Use apenas letras, números, hífen e sublinhado.`,
    );
  return plain.replace(/\/+$/, "") || "/";
}

function domainHostname(value: string): string {
  const address = pageAddress({ dominio: value, caminho: "/" });
  if (
    !address ||
    (!address.startsWith("https://") && !address.startsWith("http://"))
  )
    throw new Error("Informe o domínio real do site, sem caminho.");
  return new URL(address).hostname;
}

/** Metadata is escaped. Imported HTML is never executed to transform or export it. */
export function configurePageHtml(
  source: string,
  page: DadosPagina,
  outputs: Record<string, string>,
  canonical: string,
  warnings: string[],
): string {
  const meta = page.meta;
  const tags: string[] = [];
  let result = source;
  if (meta.titulo) {
    result = result.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, "");
    tags.push(`<title>${html(meta.titulo)}</title>`);
  }
  if (meta.descricao) {
    result = result.replace(
      /<meta\b(?=[^>]*\bname\s*=\s*["']description["'])[^>]*>/gi,
      "",
    );
    tags.push(`<meta name="description" content="${html(meta.descricao)}">`);
  }
  const safeImage = normalizeFunnelAddress(meta.imagem);
  if (meta.imagem && !safeImage)
    throw new Error(
      "A imagem de SEO precisa de uma URL HTTP(S) ou caminho seguro.",
    );
  if (safeImage)
    tags.push(`<meta property="og:image" content="${html(safeImage)}">`);
  const safeFavicon = normalizeFunnelAddress(meta.faviconPng);
  if (meta.faviconPng && !safeFavicon)
    throw new Error("O favicon precisa de uma URL HTTP(S) ou caminho seguro.");
  if (safeFavicon) tags.push(`<link rel="icon" href="${html(safeFavicon)}">`);
  tags.push(`<link rel="canonical" href="${html(canonical)}">`);
  const indexing = meta.indexacao ?? {};
  const robots = [
    meta.esconderDoGoogle || indexing.noindex ? "noindex" : "index",
    indexing.nofollow ? "nofollow" : "follow",
    ...(indexing.semCacheTrecho ? ["noarchive", "nosnippet"] : []),
    ...(indexing.semImagens ? ["noimageindex"] : []),
  ];
  result = result.replace(
    /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/gi,
    "",
  );
  tags.push(`<meta name="robots" content="${robots.join(",")}">`);
  if (indexing.robotsDisallow || indexing.bloquearIA)
    warnings.push(
      "Bloqueio de robôs por caminho/IA exige configuração do servidor; não é aplicado por esta exportação.",
    );
  if (meta.protecao && Object.values(meta.protecao).some(Boolean))
    warnings.push(
      "Proteções anti-cópia não impedem acesso ao código e não são aplicadas; a navegação e a acessibilidade são preservadas.",
    );
  if (
    meta.velocidade &&
    (meta.velocidade.cache ||
      meta.velocidade.comprimir ||
      meta.velocidade.imagens ||
      meta.velocidade.fontes ||
      meta.velocidade.minificar)
  )
    warnings.push(
      "Compressão, cache e otimização de imagens/fontes dependem dos arquivos e da VPS; não foram simulados.",
    );
  if (page.backRedirect?.ligado)
    warnings.push(
      "Back redirect não é aplicado: histórico, fechamento de aba e pagamentos não serão interceptados. Use uma saída explícita para downsell.",
    );
  if (/<meta\b[^>]*content-security-policy/i.test(source))
    warnings.push(
      "O HTML contém CSP própria. Scripts de saídas/pixels podem ser bloqueados; a política original não foi removida.",
    );
  const pixels: Record<string, string> = {};
  for (const [key, pattern] of Object.entries({
    metaPixel: /^\d{5,30}$/,
    ga4: /^G-[A-Z0-9]{4,30}$/,
    gtm: /^GTM-[A-Z0-9]{4,30}$/,
    clarity: /^[a-z0-9]{4,30}$/i,
  })) {
    const value = meta[key as "metaPixel" | "ga4" | "gtm" | "clarity"]?.trim();
    if (value && !pattern.test(value))
      throw new Error(
        `Identificador de ${key} inválido. Corrija antes de exportar.`,
      );
    if (value) pixels[key] = value;
  }
  const safeOutputs: Record<string, string> = {};
  for (const [name, value] of Object.entries(outputs)) {
    const safe = normalizeFunnelAddress(value);
    if (!safe) throw new Error(`Saída “${name}” inválida.`);
    safeOutputs[name] = safe;
    const marker = `data-saida="${html(name)}"`;
    if (
      !source.includes(marker) &&
      !source.includes(`data-saida='${html(name)}'`)
    )
      warnings.push(
        `Saída “${name}”: use data-saida="${name}" no botão do HTML importado para aplicar essa ligação.`,
      );
  }
  if (Object.keys(pixels).length)
    warnings.push(
      "Pixels são carregados somente após o visitante aceitar medição. Scripts de rastreio já existentes no ZIP permanecem sob sua responsabilidade.",
    );
  const runtime = `(()=>{const c=${scriptJson({ outputs: safeOutputs, pixels, utm: meta.repassarUtm !== false })};const target=(v)=>{const u=new URL(v,location.href);if(!/^https?:$/.test(u.protocol)||u.username||u.password)return null;if(c.utm){const q=new URLSearchParams(location.search);for(const[k,v]of q)if(/^utm_[a-z0-9_]+$/i.test(k)&&!u.searchParams.has(k))u.searchParams.set(k,v)}return u.href};document.querySelectorAll('[data-saida]').forEach(el=>{const v=c.outputs[el.getAttribute('data-saida')];if(!v)return;const u=target(v);if(!u)return;if(el.tagName==='A')el.href=u;else el.addEventListener('click',e=>{e.preventDefault();location.assign(u)})});const p=c.pixels;if(!Object.keys(p).length)return;const load=s=>{const e=document.createElement('script');e.async=true;e.src=s;document.head.appendChild(e)};const start=()=>{if(p.ga4){window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',p.ga4);load('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(p.ga4))}if(p.gtm){window.dataLayer=window.dataLayer||[];dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});load('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(p.gtm))}if(p.metaPixel){window.fbq=function(){(fbq.queue=fbq.queue||[]).push(arguments)};fbq.loaded=true;fbq.version='2.0';fbq('init',p.metaPixel);fbq('track','PageView');load('https://connect.facebook.net/en_US/fbevents.js')}if(p.clarity){window.clarity=function(){(clarity.q=clarity.q||[]).push(arguments)};load('https://www.clarity.ms/tag/'+encodeURIComponent(p.clarity))}};let consent=null;try{consent=localStorage.getItem('orbit-measurement-consent-v1')}catch{}if(consent==='yes'){start();return}if(consent==='no')return;const box=document.createElement('aside');box.setAttribute('aria-label','Privacidade e medição');box.style.cssText='position:fixed;inset:auto 12px 12px;z-index:2147483000;background:#111;color:#fff;border:1px solid #fff;padding:14px;font:14px/1.5 Arial;display:flex;gap:12px;flex-wrap:wrap;align-items:center';const label=document.createElement('span');label.textContent='Permitir medição de visitas e conversões?';box.appendChild(label);for(const[caption,value]of[['Recusar','no'],['Aceitar','yes']]){const b=document.createElement('button');b.type='button';b.textContent=caption;b.style.cssText='border:1px solid #fff;background:#111;color:#fff;padding:8px 14px;font:inherit;cursor:pointer';b.onclick=()=>{try{localStorage.setItem('orbit-measurement-consent-v1',value)}catch{}box.remove();if(value==='yes')start()};box.appendChild(b)}document.body.appendChild(box)})();`;
  tags.push(`<script data-orbit-funnel defer>${runtime}</script>`);
  // defer does not defer inline scripts; run after parsing, without overwriting handlers.
  tags[tags.length - 1] =
    `<script data-orbit-funnel>document.addEventListener('DOMContentLoaded',function(){${runtime}});</script>`;
  if (/<\/head\s*>/i.test(result))
    result = result.replace(/<\/head\s*>/i, `${tags.join("\n")}\n</head>`);
  else if (/<body\b/i.test(result))
    result = result.replace(/<body\b/i, `<head>${tags.join("\n")}</head><body`);
  else
    result = `<!doctype html><html lang="pt-BR"><head>${tags.join("\n")}</head><body>${result}</body></html>`;
  if (meta.velocidade && meta.velocidade.lazy) {
    let position = 0;
    result = result.replace(/<img\b[^>]*>/gi, (tag) =>
      ++position > 2 && !/\bloading\s*=/i.test(tag)
        ? tag.replace(/<img/i, '<img loading="lazy"')
        : tag,
    );
  }
  return result;
}

export type FunnelSiteExport = StaticPageExport & {
  warnings: string[];
  routes: string[];
};

/** One site version, not one destructive deployment per page. */
export async function exportFunnelSite(
  data: FunnelData,
  storageId: string,
  domain: string,
): Promise<FunnelSiteExport> {
  const host = domainHostname(domain);
  assertNoRedirectCycles(data);
  const warnings: string[] = [];
  const address = (node: FunnelNode) => {
    if (node.type === "store")
      return node.loja?.dominio
        ? pageAddress({ dominio: node.loja.dominio, caminho: "/" })
        : (node.url ?? "/");
    return node.pagina
      ? pageAddress(node.pagina)
      : normalizeFunnelAddress(node.url);
  };
  const paths = new Map<string, string>();
  for (const node of data.nodes.filter(
    (node) => TIPOS_PAGINA.has(node.type) || node.type === "redirect",
  )) {
    const url = address(node);
    if (!url) throw new Error(`Configure o caminho real de “${node.title}”.`);
    const parsed = new URL(url, `https://${host}`);
    if (parsed.hostname !== host) {
      warnings.push(
        `“${node.title}” fica em domínio externo e não será substituída.`,
      );
      continue;
    }
    const path = staticRoute(parsed.pathname + parsed.search + parsed.hash);
    if (
      [...paths.values()].some(
        (existing) => existing.toLowerCase() === path.toLowerCase(),
      )
    )
      throw new Error(
        `Duas páginas usam “${path}”. Cada página precisa de um caminho único.`,
      );
    paths.set(node.id, path);
  }
  if (![...paths.values()].includes("/"))
    throw new Error(
      "Configure uma página inicial com caminho / no domínio escolhido. O ZIP do site precisa de index.html na raiz.",
    );
  const files = new Map<string, SiteFile>();
  const add = async (
    node: FunnelNode,
    route: string,
    productId?: string,
    productName?: string,
  ) => {
    const product = productId
      ? node.loja?.produtos.find((product) => product.id === productId)
      : null;
    const prepared = getPreparedPageZip({
      storageId,
      funnelId:
        (productId
          ? product?.zip?.sourceFunnelId
          : node.pagina?.zip?.sourceFunnelId) ?? data.id,
      nodeId: node.id,
      productId,
    });
    const imported = productId ? true : Boolean(node.pagina?.zip);
    if (imported && !prepared)
      throw new Error(
        `Recupere ou reanexe o ZIP de “${productName ?? node.title}” antes de publicar. Nenhuma página foi enviada.`,
      );
    let site;
    const flow = contentFlowForPage(data, node.id);
    for (const page of flow.pages)
      if (paths.has(page.id))
        page.url =
          paths.get(page.id)! + (paths.get(page.id) === "/" ? "" : "/");
    if (imported && prepared) site = await importSiteFiles([prepared.file]);
    else {
      if (node.type === "checkout")
        warnings.push(
          `“${node.title}” é uma página estática de apresentação. Pagamentos exigem o checkout público integrado; este ZIP não inventa processamento de pagamento.`,
        );
      const exported = await exportFlowPage(flow, node.id);
      site = await importSiteFiles([
        new File([Uint8Array.from(exported.bytes).buffer], exported.filename),
      ]);
    }
    const prefix = route === "/" ? "" : `${route.slice(1)}/`;
    const localFiles = new Set(site.files.map((file) => `/${file.path}`));
    const outputs: Record<string, string> = {};
    for (const [name, output] of Object.entries(node.pagina?.saidas ?? {})) {
      const destination = output.etapaId
        ? data.nodes.find((target) => target.id === output.etapaId)
        : null;
      const value = output.etapaId
        ? (paths.get(output.etapaId) ??
          (destination ? address(destination) : null))
        : normalizeFunnelAddress(output.url);
      if (!value)
        throw new Error(
          `Saída “${name}” de “${node.title}” não tem destino seguro.`,
        );
      outputs[name] =
        paths.has(output.etapaId ?? "") && value !== "/" ? `${value}/` : value;
    }
    for (const original of site.files) {
      const mounted = `${prefix}${original.path}`;
      if (files.has(mounted.toLowerCase()))
        throw new Error(
          `O arquivo “${mounted}” aparece em dois pacotes. Remova páginas duplicadas do ZIP da página inicial.`,
        );
      let entry = { ...original, path: mounted };
      if (/\.(html?|css)$/i.test(original.path)) {
        let text = decode.decode(original.data);
        if (prefix) {
          // Relocate absolute references only when they name an asset in this package.
          text = text.replace(
            /((?:src|href|poster)\s*=\s*["']|url\(\s*["']?)(\/(?!\/)[^"'\s)<>]+)(["']?)/gi,
            (match, before: string, resource: string, after: string) => {
              const path = resource.split(/[?#]/)[0];
              return localFiles.has(path)
                ? `${before}/${prefix}${resource.slice(1)}${after}`
                : match;
            },
          );
        }
        if (original.path === "index.html")
          text = configurePageHtml(
            text,
            node.pagina ?? { caminho: route, meta: {}, saidas: {} },
            imported ? outputs : {},
            `https://${host}${route === "/" ? "/" : `${route}/`}`,
            warnings,
          );
        entry = { ...entry, data: encode.encode(text) };
      }
      if (
        /\.js$/i.test(original.path) &&
        prefix &&
        /["'`]\/(?!\/)/.test(decode.decode(original.data))
      )
        warnings.push(
          `“${mounted}” contém caminhos absolutos em JavaScript. Confira-os no domínio final; scripts importados não são reescritos.`,
        );
      files.set(mounted.toLowerCase(), entry);
    }
  };
  for (const node of data.nodes) {
    const route = paths.get(node.id);
    if (!route) continue;
    if (node.type === "redirect") {
      const name =
        route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
      if (files.has(name.toLowerCase()))
        throw new Error(
          `O pacote da página inicial já contém “${name}”. Remova esse caminho duplicado.`,
        );
      files.set(name.toLowerCase(), {
        path: name,
        data: encode.encode(staticRedirectHtml(data, node, paths, warnings)),
        mime: "text/html",
      });
      continue;
    }
    await add(node, route);
    for (const product of node.loja?.produtos.filter(
      (product) => product.ativo,
    ) ?? []) {
      if (!product.zip)
        throw new Error(
          `Prepare o ZIP do produto “${nomeDoProduto(product)}” ou desative-o antes de publicar.`,
        );
      const productPath = staticRoute(product.caminho);
      if (pathsHasRoute(paths, productPath))
        throw new Error(
          `O produto “${nomeDoProduto(product)}” repete um caminho de página.`,
        );
      await add(node, productPath, product.id, nomeDoProduto(product));
      paths.set(`product:${node.id}:${product.id}`, productPath);
    }
  }
  const output = await exportStaticFiles([...files.values()], "funil-site.zip");
  return {
    ...output,
    warnings: [...new Set(warnings)],
    routes: [...paths.values()],
  };
}

function pathsHasRoute(paths: Map<string, string>, route: string) {
  return [...paths.values()].some(
    (path) => path.toLowerCase() === route.toLowerCase(),
  );
}
