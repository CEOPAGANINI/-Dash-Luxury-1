import { zip, type Zippable } from "fflate";

import { parseFlow, type LandingFlow, type FlowPage } from "./flow-model";
import {
  importSiteFiles,
  SITE_PACKAGE_LIMITS,
  type SiteFile,
  type SitePackage,
} from "./site-package";

export const STATIC_EXPORT_MAX_BYTES = 3_000_000;

export interface StaticPageExport {
  bytes: Uint8Array;
  filename: string;
  fileCount: number;
}

const encoder = new TextEncoder();

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function filename(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${slug || "pagina"}.zip`;
}

function file(path: string, text: string, mime: string): SiteFile {
  return { path, data: encoder.encode(text), mime };
}

/** Uses the same allowlist and security checks as import; never trusts mime hints. */
async function validateFiles(files: SiteFile[]): Promise<SiteFile[]> {
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > SITE_PACKAGE_LIMITS.files
  )
    throw new Error(
      "O ZIP exportado pode conter no máximo 400 arquivos. Reduza o pacote e tente novamente.",
    );
  let total = 0;
  const paths: string[] = [];
  const inputs: File[] = [];
  for (const entry of files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !(entry.data instanceof Uint8Array) ||
      !entry.path ||
      entry.path.length > 512
    )
      throw new Error(
        "O pacote contém um arquivo inválido. Importe os arquivos novamente.",
      );
    const path = entry.path.normalize("NFC");
    if (
      path.endsWith("/") ||
      path
        .split("/")
        .some((part) => part === "__MACOSX" || part === ".DS_Store")
    )
      throw new Error(
        "Remova entradas de pastas e metadados do pacote antes de exportar.",
      );
    total += entry.data.byteLength;
    if (
      entry.data.byteLength > SITE_PACKAGE_LIMITS.fileBytes ||
      total > SITE_PACKAGE_LIMITS.totalBytes
    )
      throw new Error(
        "O pacote excede os limites: 10 MB por arquivo e 40 MB descompactados.",
      );
    paths.push(path);
    // A fresh copy also prevents subsequent UI changes from mutating the export.
    inputs.push(new File([Uint8Array.from(entry.data).buffer], path));
  }
  const validated = await importSiteFiles(inputs);
  // Import removes one common wrapper folder. Export must retain all original
  // paths because relative URLs in CSS, JS and other HTML pages depend on them.
  const segments = paths.map((path) => path.split("/"));
  let common = 0;
  while (
    segments.every(
      (parts) =>
        parts.length > common + 1 && parts[common] === segments[0][common],
    )
  )
    common++;
  const prefix = segments[0].slice(0, common).join("/");
  if (validated.files.length !== files.length)
    throw new Error("O pacote contém entradas que não podem ser exportadas.");
  return validated.files.map((entry) => ({
    ...entry,
    path: prefix ? `${prefix}/${entry.path}` : entry.path,
  }));
}

const PAGE_CSS = `:root{color-scheme:light;font-family:Arial,Helvetica,sans-serif;color:#111;background:#f4f4f4}*{box-sizing:border-box;border-radius:0}body{margin:0;padding:clamp(20px,5vw,72px)}main{max-width:980px;margin:0 auto;background:#fff;border:1px solid #d8d8d8;box-shadow:8px 8px 0 #e0e0e0;padding:clamp(24px,7vw,88px)}.eyebrow{font-size:14px;font-weight:700;overflow-wrap:anywhere}h1{max-width:18ch;font-size:clamp(32px,6vw,72px);line-height:1.06;letter-spacing:-.045em;margin:40px 0 24px;overflow-wrap:anywhere}.description{max-width:64ch;font-size:clamp(16px,2vw,20px);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}.action{display:inline-block;background:#111;color:#fff;border:1px solid #111;padding:16px 22px;font-size:15px;font-weight:700;text-decoration:none;overflow-wrap:anywhere}.action.secondary{background:#fff;color:#111}.action:hover{background:#333;color:#fff}.action:focus-visible{outline:3px solid #555;outline-offset:4px}@media(max-width:480px){.actions{display:grid}.action{width:100%;text-align:center}h1{margin-top:28px}}`;

function generatedFiles(flow: LandingFlow, page: FlowPage): SiteFile[] {
  if (page.imageUrl)
    throw new Error(
      "Para exportar uma página com imagem, importe um pacote HTML com a imagem e seus assets. O exportador não baixa imagens externas nem presume arquivos locais.",
    );
  const edges = flow.connections.filter((edge) => edge.source === page.id);
  const links = edges.map((edge, index) => {
    const target = flow.pages.find(
      (candidate) => candidate.id === edge.target,
    )!;
    if (!target.url)
      throw new Error(
        `Configure a URL real de “${target.name}” antes de exportar. O ZIP não cria checkout nem páginas de destino.`,
      );
    const label =
      (index === 0 ? page.buttonLabel : edge.label) ||
      edge.label ||
      target.name;
    return `<a class="action${index ? " secondary" : ""}" href="${escapeHtml(target.url)}">${escapeHtml(label)}</a>`;
  });
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.name)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="stylesheet" href="./orbit-page.css">
</head>
<body>
<main>
<p class="eyebrow">${escapeHtml(page.name)}</p>
<h1>${escapeHtml(page.headline)}</h1>
<p class="description">${escapeHtml(page.description)}</p>
${links.length ? `<nav class="actions" aria-label="Próximas páginas">${links.join("\n")}</nav>` : ""}
</main>
</body>
</html>`;
  return [
    file("index.html", html, "text/html"),
    file("orbit-page.css", PAGE_CSS, "text/css"),
  ];
}

function rootHtml(html: string, entryPath: string): string {
  if (/<base(?=[\s/>])/i.test(html))
    throw new Error(
      "A página importada contém <base>. Remova essa configuração e use caminhos relativos antes de exportar, para preservar os assets.",
    );
  const directory = entryPath.split("/").slice(0, -1);
  if (!directory.length) return html;
  // Include the entry filename, not only its directory: #anchors and ?queries
  // must resolve to the preserved original page rather than a directory index.
  const base = `./${entryPath.split("/").map(encodeURIComponent).join("/")}`;
  // Place the local base before any original markup so even unusual, but valid,
  // HTML cannot load an earlier relative resource against the ZIP root.
  // Retain a leading doctype to preserve standards mode in the browser.
  const doctype = html.match(/^\uFEFF?\s*<!doctype\s+html[^>]*>/i);
  const offset = doctype?.[0].length ?? 0;
  return `${html.slice(0, offset)}\n<base href="${escapeHtml(base)}">\n${html.slice(offset)}`;
}

async function importedFiles(site: SitePackage): Promise<SiteFile[]> {
  if (
    !site ||
    site.version !== 1 ||
    typeof site.entryPath !== "string" ||
    !site.entryPath ||
    site.entryPath.length > 512
  )
    throw new Error("Selecione uma página HTML válida no pacote importado.");
  const files = await validateFiles(site.files);
  const entryPath = site.entryPath.normalize("NFC");
  const entry = files.find((candidate) => candidate.path === entryPath);
  if (!entry || !/\.html?$/i.test(entry.path))
    throw new Error(
      "A página de entrada selecionada não existe no pacote HTML.",
    );
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(entry.data);
  } catch {
    throw new Error("A página HTML deve usar UTF-8 para ser exportada.");
  }
  const output = files.filter(
    (candidate) => candidate.path.toLowerCase() !== "index.html",
  );
  const previousIndex = files.find(
    (candidate) => candidate.path.toLowerCase() === "index.html",
  );
  if (previousIndex && previousIndex.path !== entry.path) {
    const paths = new Set(
      files.map((candidate) => candidate.path.toLowerCase()),
    );
    let backup = "orbit-original-index.html",
      counter = 1;
    while (paths.has(backup)) backup = `orbit-original-index-${counter++}.html`;
    output.push({ ...previousIndex, path: backup });
  }
  output.push(file("index.html", rootHtml(html, entryPath), "text/html"));
  // The added entry/backup must satisfy the importer limits too, so users can
  // round-trip the exported ZIP through the same import flow.
  return validateFiles(output);
}

/** Creates files in memory only. Never executes imported code or contacts a host. */
export async function exportFlowPage(
  flow: LandingFlow,
  pageId: string,
  site?: SitePackage,
): Promise<StaticPageExport> {
  const validated = parseFlow(flow);
  if (!validated)
    throw new Error(
      "O funil contém dados inválidos. Revise as páginas e ligações antes de exportar.",
    );
  const page = validated.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error("Selecione uma página do funil para exportar.");
  const files = site
    ? await importedFiles(site)
    : generatedFiles(validated, page);
  const entries = Object.fromEntries(
    files.map((entry) => [entry.path, entry.data]),
  ) as Zippable;
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancel();
      reject(
        new Error(
          "A criação do ZIP demorou demais. Reduza os arquivos e tente novamente.",
        ),
      );
    }, 15_000);
    const cancel = zip(entries, { level: 6 }, (error, result) => {
      clearTimeout(timeout);
      if (error)
        reject(
          new Error(
            "Não foi possível criar o ZIP. Reduza os arquivos e tente novamente.",
          ),
        );
      else resolve(result);
    });
  });
  if (bytes.byteLength > STATIC_EXPORT_MAX_BYTES)
    throw new Error(
      "O ZIP exportado excede 3 MB. Comprima imagens e fontes ou reduza os arquivos antes de tentar novamente.",
    );
  return { bytes, filename: filename(page.name), fileCount: files.length };
}
