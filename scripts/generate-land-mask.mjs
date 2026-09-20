// Gera src/features/analytics/world-land-mask.ts a partir do world-atlas (Natural Earth 110m).
// Rasteriza a terra num grid equirretangular e serializa em RLE base36.
//
// A máscara é estática — este script só precisa de correr se quisermos mudar a
// resolução do grid. As dependências não ficam no projeto de propósito:
//
//   npm i -D world-atlas topojson-client
//   node scripts/generate-land-mask.mjs
//   npm uninstall world-atlas topojson-client
import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";

const COLS = 720; // 0.5° em longitude
const ROWS = 360; // 0.5° em latitude

const topo = JSON.parse(
  readFileSync("node_modules/world-atlas/land-110m.json", "utf8"),
);
const land = feature(topo, topo.objects.land);

/** Todos os anéis (exteriores e buracos) achatados, com bounding box. */
const rings = [];
for (const f of land.features ?? [land]) {
  const geom = f.geometry ?? f;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      rings.push({ ring, minX, maxX, minY, maxY });
    }
  }
}

function insideRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isLand(lon, lat) {
  let count = 0;
  for (const r of rings) {
    if (lon < r.minX || lon > r.maxX || lat < r.minY || lat > r.maxY) continue;
    if (insideRing(r.ring, lon, lat)) count++;
  }
  // nº ímpar de anéis => dentro (trata buracos, ex. Mar Cáspio)
  return count % 2 === 1;
}

const bits = new Uint8Array(COLS * ROWS);
for (let row = 0; row < ROWS; row++) {
  const lat = 90 - (row + 0.5) * (180 / ROWS);
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5) * (360 / COLS);
    bits[row * COLS + col] = isLand(lon, lat) ? 1 : 0;
  }
  if (row % 60 === 0) process.stderr.write(`linha ${row}/${ROWS}\n`);
}

// RLE: sequência de comprimentos alternando água/terra, começando em água.
const runs = [];
let current = 0;
let len = 0;
for (let i = 0; i < bits.length; i++) {
  if (bits[i] === current) len++;
  else {
    runs.push(len);
    current = bits[i];
    len = 1;
  }
}
runs.push(len);

// Cada run em base36 separado por ".". Runs > 36^3 não ocorrem neste grid.
const encoded = runs.map((n) => n.toString(36)).join(".");

const total = bits.reduce((a, b) => a + b, 0);
process.stderr.write(
  `terra: ${total}/${bits.length} células (${((total / bits.length) * 100).toFixed(1)}%), ${runs.length} runs, ${encoded.length} chars\n`,
);

const out = `/**
 * Máscara de terra do planeta em grid equirretangular ${COLS}x${ROWS} (0,5°).
 *
 * Gerado a partir do Natural Earth 110m (pacote \`world-atlas\`, domínio público).
 * Não editar à mão — é o dataset que desenha os continentes do <LiveGlobe />.
 *
 * Formato: RLE em base36, runs alternados começando em "água".
 */

export const LAND_MASK_COLS = ${COLS};
export const LAND_MASK_ROWS = ${ROWS};

const LAND_MASK_RLE =
  "${encoded}";

let cache: Uint8Array | null = null;

/** Descomprime a máscara (1 = terra) e mantém em cache no módulo. */
export function getLandMask(): Uint8Array {
  if (cache) return cache;
  const bits = new Uint8Array(LAND_MASK_COLS * LAND_MASK_ROWS);
  let offset = 0;
  let value = 0;
  for (const run of LAND_MASK_RLE.split(".")) {
    const length = parseInt(run, 36);
    if (value === 1) bits.fill(1, offset, offset + length);
    offset += length;
    value = value === 1 ? 0 : 1;
  }
  cache = bits;
  return bits;
}

/** Diz se um par lat/lon cai em terra firme. */
export function isLandAt(lat: number, lon: number): boolean {
  const row = Math.floor(((90 - lat) / 180) * LAND_MASK_ROWS);
  const col = Math.floor(((lon + 180) / 360) * LAND_MASK_COLS);
  if (row < 0 || row >= LAND_MASK_ROWS) return false;
  const c = ((col % LAND_MASK_COLS) + LAND_MASK_COLS) % LAND_MASK_COLS;
  return getLandMask()[row * LAND_MASK_COLS + c] === 1;
}
`;

writeFileSync("src/features/analytics/world-land-mask.ts", out);
process.stderr.write("escrito src/features/analytics/world-land-mask.ts\n");
