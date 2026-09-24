import { AsyncInflate } from "fflate";

export interface SiteFile {
  path: string;
  data: Uint8Array;
  mime: string;
}

export interface SitePackage {
  version: 1;
  name: string;
  files: SiteFile[];
  entryPath: string;
  importedAt: string;
}

const MB = 1024 * 1024;
export const SITE_PACKAGE_LIMITS = {
  archiveBytes: 20 * MB,
  fileBytes: 10 * MB,
  totalBytes: 40 * MB,
  files: 400,
} as const;

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  txt: "text/plain",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

function invalid(message: string): never {
  throw new Error(message);
}

function safePath(raw: string): string {
  if (
    !raw ||
    raw.length > 512 ||
    /[\\\u0000-\u001f\u007f-\u009f]/u.test(raw) ||
    raw.startsWith("/") ||
    /^[a-z]:/i.test(raw)
  ) {
    invalid("O pacote contém um caminho inválido ou absoluto.");
  }
  const path = raw.normalize("NFC").replace(/\/$/, "");
  if (
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.length > 255 ||
          /[<>:"|?*]/.test(part) ||
          /[. ]$/.test(part),
      )
  ) {
    invalid(
      "O pacote contém um caminho inseguro (pastas '..' não são aceitas).",
    );
  }
  return path;
}

function ignored(path: string): boolean {
  return path
    .split("/")
    .some((part) => part === "__MACOSX" || part === ".DS_Store");
}

function assertPublicFile(path: string): string {
  const parts = path.toLowerCase().split("/");
  if (
    parts.some(
      (part) =>
        part.startsWith(".env") ||
        [".git", ".svn", ".hg", ".ssh"].includes(part) ||
        /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.|$)/.test(part) ||
        /(?:^|[._-])(?:credentials?|secrets?|private[._-]?keys?)(?:[._-]|$)/.test(
          part,
        ),
    )
  ) {
    invalid(
      "Remova arquivos de segredos, credenciais e repositório antes de importar.",
    );
  }
  // Extensão só depois de um ponto que não seja o primeiro caractere: "css" e
  // ".css" não têm extensão (a mesma regra do Servidor do Funil).
  const extension = /.\.([^.]*)$/.exec(parts.at(-1)!)?.[1] ?? "";
  if (["php", "phtml", "php3", "php4", "php5", "phar"].includes(extension)) {
    invalid(
      "Este importador aceita sites estáticos HTML/CSS/JS. Temas, plugins e sites WordPress/PHP precisam ser exportados como site estático.",
    );
  }
  if (!Object.prototype.hasOwnProperty.call(MIME, extension))
    invalid(
      `Tipo de arquivo não permitido: ${path}. Envie HTML, CSS, JS, JSON, imagens, fontes ou TXT.`,
    );
  return MIME[extension];
}

function checkSize(size: number, total: number) {
  if (size > SITE_PACKAGE_LIMITS.fileBytes)
    invalid("Cada arquivo pode ter no máximo 10 MB.");
  if (total > SITE_PACKAGE_LIMITS.totalBytes)
    invalid("O site descompactado pode ter no máximo 40 MB.");
}

/** Read only: importing never executes HTML/JS or changes a public website. */
export async function importSiteFiles(input: File[]): Promise<SitePackage> {
  if (!input.length) invalid("Selecione um ZIP ou os arquivos do site.");
  if (input.length > SITE_PACKAGE_LIMITS.files)
    invalid("O pacote pode conter no máximo 400 arquivos e pastas.");
  const archives = input.filter((file) => /\.zip$/i.test(file.name));
  let files: SiteFile[];
  if (archives.length) {
    if (input.length !== 1)
      invalid("Importe um ZIP por vez, sem misturar arquivos soltos.");
    if (input[0].size > SITE_PACKAGE_LIMITS.archiveBytes)
      invalid("O ZIP pode ter no máximo 20 MB.");
    files = await readZip(new Uint8Array(await input[0].arrayBuffer()));
  } else {
    const seen = new Set<string>();
    let total = 0;
    const validated = input.flatMap((file) => {
      const path = safePath(file.webkitRelativePath || file.name);
      if (ignored(path)) return [];
      claimPath(seen, path);
      const mime = assertPublicFile(path);
      total += file.size;
      checkSize(file.size, total);
      return [{ file, path, mime }];
    });
    assertNoFileParents(validated.map(({ path }) => path));
    files = [];
    for (const { file, path, mime } of validated) {
      const data = new Uint8Array(await file.arrayBuffer());
      if (data.length !== file.size)
        invalid(
          "O tamanho do arquivo mudou durante a leitura. Importe novamente.",
        );
      files.push({ path, mime, data });
    }
  }
  files = stripCommonRoot(files);
  const entries = files
    .filter((file) => file.mime === "text/html")
    .map((file) => file.path)
    .sort();
  if (!entries.length)
    invalid(
      "Nenhuma página HTML encontrada. Inclua index.html ou outra página HTML no site.",
    );
  return {
    version: 1,
    name:
      input.length === 1 ? input[0].name.replace(/\.[^.]+$/, "") : "Meu site",
    files,
    entryPath:
      entries.find((path) => path.toLowerCase() === "index.html") ?? entries[0],
    importedAt: new Date().toISOString(),
  };
}

function claimPath(seen: Set<string>, path: string) {
  const key = path.toLowerCase();
  if (seen.has(key))
    invalid(
      `Caminho duplicado no pacote: ${path}. Nenhum arquivo foi substituído.`,
    );
  seen.add(key);
}

function assertNoFileParents(paths: string[]) {
  const files = new Set(paths.map((path) => path.toLowerCase()));
  for (const path of files) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (files.has(parts.slice(0, i).join("/")))
        invalid(
          "Um caminho do pacote está sendo usado como arquivo e pasta ao mesmo tempo.",
        );
    }
  }
}

function stripCommonRoot(files: SiteFile[]): SiteFile[] {
  if (!files.length) return files;
  const segments = files.map((file) => file.path.split("/"));
  let count = 0;
  while (
    segments.every(
      (parts) =>
        parts.length > count + 1 && parts[count] === segments[0][count],
    )
  )
    count++;
  return files.map((file) => ({
    ...file,
    path: file.path.split("/").slice(count).join("/"),
  }));
}

export function getHtmlEntries(site: SitePackage): string[] {
  return site.files
    .filter((file) => /\.html?$/i.test(file.path))
    .map((file) => file.path)
    .sort();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const unit = bytes < MB ? "KB" : "MB";
  return `${(bytes / (unit === "KB" ? 1024 : MB)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}`;
}

interface ZipEntry {
  path: string;
  mime: string;
  start: number;
  compressedSize: number;
  size: number;
  crc: number;
  method: number;
  skip: boolean;
}

function readZipMetadata(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length > SITE_PACKAGE_LIMITS.archiveBytes)
    invalid("O ZIP pode ter no máximo 20 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) {
      end = i;
      break;
    }
  }
  if (end < 0) invalid("ZIP inválido ou incompleto.");
  const count = u16(end + 10),
    centralSize = u32(end + 12),
    centralStart = u32(end + 16);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== count ||
    count === 0xffff ||
    centralSize === 0xffffffff ||
    centralStart === 0xffffffff
  )
    invalid("ZIP dividido ou ZIP64 não é suportado. Exporte um ZIP padrão.");
  if (count > SITE_PACKAGE_LIMITS.files)
    invalid("O pacote pode conter no máximo 400 arquivos e pastas.");
  if (!count || centralStart + centralSize !== end)
    invalid("Estrutura ZIP não suportada ou corrompida.");
  const entries: ZipEntry[] = [],
    ranges: [number, number][] = [],
    seen = new Set<string>();
  let cursor = centralStart,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50)
      invalid("Diretório do ZIP inválido.");
    const flags = u16(cursor + 8),
      method = u16(cursor + 10);
    const crc = u32(cursor + 16),
      compressedSize = u32(cursor + 20),
      size = u32(cursor + 24);
    const nameLength = u16(cursor + 28),
      extraLength = u16(cursor + 30),
      commentLength = u16(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    const local = u32(cursor + 42),
      mode = (u32(cursor + 38) >>> 16) & 0xf000;
    if (
      next > end ||
      !nameLength ||
      u16(cursor + 34) ||
      u16(cursor + 6) > 20 ||
      flags & ~0x080e ||
      (method === 0 && flags & 6) ||
      ![0, 8].includes(method) ||
      [compressedSize, size, local].includes(0xffffffff)
    )
      invalid(
        "ZIP criptografado, ZIP64 ou compressão não suportada. Use ZIP padrão (Store/Deflate), sem senha.",
      );
    if (mode && mode !== 0x8000 && mode !== 0x4000)
      invalid("Links simbólicos e arquivos especiais não são permitidos.");
    const rawName = decodeName(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      flags,
    );
    const directory = rawName.endsWith("/");
    if (
      ((mode === 0x4000 || u32(cursor + 38) & 0x10) && !directory) ||
      (mode === 0x8000 && directory)
    )
      invalid("Metadados de pasta inconsistentes no ZIP.");
    const path = safePath(rawName);
    claimPath(seen, path);
    const skip = directory || ignored(path);
    const mime = skip ? "" : assertPublicFile(path);
    total += size;
    checkSize(size, total);
    if (directory && size !== 0)
      invalid("Uma pasta do ZIP contém dados inesperados.");
    checkExtra(view, cursor + 46 + nameLength, extraLength);
    if (
      local + 30 > centralStart ||
      u32(local) !== 0x04034b50 ||
      u16(local + 4) > 20 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method
    )
      invalid("Cabeçalhos ZIP inconsistentes.");
    const localNameLength = u16(local + 26),
      localExtraLength = u16(local + 28);
    const start = local + 30 + localNameLength + localExtraLength;
    if (
      start + compressedSize > centralStart ||
      start > centralStart ||
      localNameLength !== nameLength ||
      decodeName(
        bytes.subarray(local + 30, local + 30 + localNameLength),
        flags,
      ) !== rawName
    )
      invalid("Caminhos ou tamanhos inconsistentes no ZIP.");
    checkExtra(view, local + 30 + localNameLength, localExtraLength);
    let rangeEnd = start + compressedSize;
    if (flags & 8) {
      if (
        ![0, crc].includes(u32(local + 14)) ||
        ![0, compressedSize].includes(u32(local + 18)) ||
        ![0, size].includes(u32(local + 22))
      )
        invalid("Cabeçalho ZIP diverge do descritor.");
      const descriptor =
        rangeEnd +
        (rangeEnd + 4 <= centralStart && u32(rangeEnd) === 0x08074b50 ? 4 : 0);
      if (
        descriptor + 12 > centralStart ||
        u32(descriptor) !== crc ||
        u32(descriptor + 4) !== compressedSize ||
        u32(descriptor + 8) !== size
      )
        invalid("Descritor ZIP inconsistente.");
      rangeEnd = descriptor + 12;
    } else if (
      u32(local + 14) !== crc ||
      u32(local + 18) !== compressedSize ||
      u32(local + 22) !== size
    )
      invalid("Tamanhos ou CRC inconsistentes no ZIP.");
    if (method === 0 && compressedSize !== size)
      invalid("Tamanho inválido para arquivo ZIP sem compressão.");
    ranges.push([local, rangeEnd]);
    entries.push({
      path,
      mime,
      start,
      compressedSize,
      size,
      crc,
      method,
      skip,
    });
    cursor = next;
  }
  if (cursor !== end) invalid("Diretório ZIP contém dados não suportados.");
  ranges.sort((a, b) => a[0] - b[0]);
  let previous = 0;
  for (const [start, end] of ranges) {
    if (start !== previous)
      invalid("ZIP com arquivos sobrepostos ou dados extras não é suportado.");
    previous = end;
  }
  if (previous !== centralStart)
    invalid("ZIP contém dados extras não suportados.");
  assertNoFileParents(
    entries.filter((entry) => !entry.skip).map(({ path }) => path),
  );
  return entries;
}

function decodeName(bytes: Uint8Array, flags: number) {
  if (!(flags & 0x800) && bytes.some((byte) => byte > 127))
    invalid("Use nomes UTF-8 ou sem acentos ao exportar o ZIP.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("Nome de arquivo com codificação inválida no ZIP.");
  }
}

function checkExtra(view: DataView, start: number, length: number) {
  let cursor = start;
  const end = start + length;
  while (cursor < end) {
    if (cursor + 4 > end) invalid("Metadados ZIP inválidos.");
    const tag = view.getUint16(cursor, true),
      size = view.getUint16(cursor + 2, true);
    if ([0x0001, 0x9901, 0x7075].includes(tag))
      invalid("ZIP64, criptografia ou nomes alternativos não são suportados.");
    cursor += 4 + size;
    if (cursor > end) invalid("Metadados ZIP inválidos.");
  }
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function updateCrc(crc: number, data: Uint8Array) {
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc;
}

async function readZip(bytes: Uint8Array): Promise<SiteFile[]> {
  const entries = readZipMetadata(bytes),
    files: SiteFile[] = [];
  let expanded = 0;
  for (const entry of entries) {
    // Validate ignored entries too: hidden metadata cannot bypass expansion limits.
    const input = bytes.subarray(
      entry.start,
      entry.start + entry.compressedSize,
    );
    const data =
      entry.method === 0
        ? input.slice()
        : await inflateLimited(input, entry.size);
    expanded += data.length;
    checkSize(data.length, expanded);
    if (
      data.length !== entry.size ||
      (updateCrc(0xffffffff, data) ^ 0xffffffff) >>> 0 !== entry.crc
    )
      invalid(`Arquivo ZIP corrompido (CRC/tamanho): ${entry.path}.`);
    if (!entry.skip) files.push({ path: entry.path, mime: entry.mime, data });
  }
  return files;
}

function inflateLimited(
  input: Uint8Array,
  expected: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0,
      offset = 0,
      done = false;
    const stop = (error: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      stream.terminate();
      reject(error);
    };
    const stream = new AsyncInflate((error, chunk, final) => {
      if (done) return;
      if (error) {
        stop(
          new Error(
            "Falha ao descompactar ZIP. O arquivo pode estar corrompido.",
          ),
        );
        return;
      }
      total += chunk.length;
      if (total > expected || total > SITE_PACKAGE_LIMITS.fileBytes) {
        stop(
          new Error(
            "ZIP excedeu o tamanho declarado ou o limite de 10 MB por arquivo.",
          ),
        );
        return;
      }
      chunks.push(chunk);
      if (final) {
        done = true;
        clearTimeout(timeout);
        stream.terminate();
        const result = new Uint8Array(total);
        let cursor = 0;
        for (const data of chunks) {
          result.set(data, cursor);
          cursor += data.length;
        }
        resolve(result);
      } else pushNext();
    });
    const timeout = setTimeout(
      () =>
        stop(
          new Error(
            "O ZIP demorou demais para descompactar. Tente um pacote menor.",
          ),
        ),
      30000,
    );
    function pushNext() {
      // Backpressure: only one small compressed chunk is in the worker at a time.
      const end = Math.min(offset + 1024, input.length);
      const chunk = input.slice(offset, end);
      offset = end;
      try {
        stream.push(chunk, offset === input.length);
      } catch {
        stop(
          new Error("Não foi possível iniciar a descompactação segura do ZIP."),
        );
      }
    }
    pushNext();
  });
}
