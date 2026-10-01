import type { FunnelData, FunnelNode } from "./funnel-model";
import { funnelNodeAddress, normalizeFunnelAddress } from "./funnel-address";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
const safeJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

/** Static client routing is not IP geolocation, access control or payment logic. */
export function staticRedirectHtml(
  data: FunnelData,
  node: FunnelNode,
  paths: Map<string, string>,
  warnings: string[],
): string {
  const ownPath = paths.get(node.id)!;
  const resolve = (nodeId: string | undefined, url: string) => {
    const target = nodeId
      ? data.nodes.find((candidate) => candidate.id === nodeId)
      : null;
    if (nodeId && !target)
      throw new Error(`“${node.title}” aponta para um bloco removido.`);
    const safe = normalizeFunnelAddress(
      nodeId
        ? (paths.get(nodeId) ?? (target ? funnelNodeAddress(target) : ""))
        : url,
    );
    if (!safe) throw new Error(`“${node.title}” tem um destino inválido.`);
    if (
      nodeId === node.id ||
      safe.replace(/\/$/, "") === ownPath.replace(/\/$/, "")
    )
      throw new Error(`“${node.title}” redireciona para si mesma.`);
    return paths.has(nodeId ?? "") && safe !== "/" ? `${safe}/` : safe;
  };
  const rules = (node.redir?.regras ?? [])
    .filter((rule) => rule.ativo)
    .map((rule) => {
      if (rule.tipo === "regiao" || rule.tipo === "rede")
        throw new Error(
          `“${node.title}”: regras de região/IP ou tipo de rede não podem ser executadas com segurança em site estático. Desative-as ou use um roteador de servidor antes de publicar.`,
        );
      return { ...rule, destino: resolve(rule.destinoNoId, rule.destino) };
    });
  const slices = rules
    .filter((rule) => rule.tipo === "fatia")
    .reduce((sum, rule) => sum + rule.percentual, 0);
  if (slices > 100)
    throw new Error(
      `“${node.title}”: as fatias precisam somar no máximo 100%.`,
    );
  const fallbackEdges = data.edges.filter((edge) => edge.source === node.id);
  if (fallbackEdges.length > 1)
    throw new Error(
      `“${node.title}”: escolha uma única ligação de saída padrão; use as regras para dividir os outros destinos.`,
    );
  const fallback = fallbackEdges[0]
    ? resolve(fallbackEdges[0].target, "")
    : null;
  if (!fallback && slices !== 100)
    throw new Error(
      `“${node.title}” precisa de uma saída padrão para visitantes que não batem nas regras.`,
    );
  warnings.push(
    `“${node.title}”: distribuição percentual executada no navegador, com sorteio por sessão. Aparelho/sistema/origem são inferidos de UA e utm_source, não são regras de segurança e não geram métricas neste painel.`,
  );
  const config = { key: `orbit-route:${data.id}:${node.id}`, rules, fallback };
  const runtime = `(()=>{const c=${safeJson(config)};const ua=navigator.userAgent;const device=/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?'tablet':/Mobile|Android|iPhone|iPod/i.test(ua)?'mobile':'desktop';const system=/Android/i.test(ua)?'android':/iPad|iPhone|iPod/i.test(ua)?'ios':/CrOS/i.test(ua)?'chromeos':/Windows/i.test(ua)?'windows':/Mac/i.test(ua)?'macos':/Linux/i.test(ua)?'linux':'outro_so';const q=new URLSearchParams(location.search);const source=(q.get('utm_source')||'outra_origem').toLowerCase();let bucket;try{const old=sessionStorage.getItem(c.key);if(old!==null&&/^\\d{1,2}$/.test(old))bucket=Number(old)}catch{}if(bucket===undefined){const random=new Uint32Array(1);crypto.getRandomValues(random);bucket=random[0]%100;try{sessionStorage.setItem(c.key,String(bucket))}catch{}}let lower=0,destination=c.fallback;for(const r of c.rules){let hit=false;if(r.tipo==='fatia'){const end=lower+r.percentual;hit=bucket>=lower&&bucket<end;lower=end}else if(r.tipo==='dispositivo')hit=r.dispositivos.includes(device);else if(r.tipo==='sistema')hit=(r.sistemas||[]).includes(system);else if(r.tipo==='origem')hit=(r.origens||[]).includes(source);if(hit){destination=r.destino;break}}if(!destination)return;const target=new URL(destination,location.href);if(!/^https?:$/.test(target.protocol)||target.username||target.password||target.origin===location.origin&&target.pathname.replace(/\\/$/,'')===location.pathname.replace(/\\/$/,''))return;for(const[k,v]of q)if(/^utm_[a-z0-9_]+$/i.test(k)&&!target.searchParams.has(k))target.searchParams.set(k,v);location.replace(target.href)})();`;
  const manual = fallback ?? rules[0]?.destino;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(node.title)}</title></head><body><main><h1>Continuar</h1><p>Selecionando a próxima etapa.</p>${manual ? `<a href="${escape(manual)}">Continuar manualmente</a>` : ""}</main><script>${runtime}</script></body></html>`;
}

/** Only automatic redirect-to-redirect edges constitute a redirect loop. */
export function assertNoRedirectCycles(data: FunnelData): void {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const done = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id))
      throw new Error(
        "Há um ciclo entre redirecionadores. Remova-o antes de publicar.",
      );
    if (done.has(id)) return;
    const node = byId.get(id);
    if (node?.type !== "redirect") return;
    active.add(id);
    const destinations = [
      ...(node.redir?.regras
        .filter((rule) => rule.ativo)
        .map((rule) => rule.destinoNoId) ?? []),
      ...data.edges
        .filter((edge) => edge.source === id)
        .map((edge) => edge.target),
    ];
    for (const target of destinations) if (target) visit(target);
    active.delete(id);
    done.add(id);
  };
  for (const node of data.nodes) visit(node.id);
}
