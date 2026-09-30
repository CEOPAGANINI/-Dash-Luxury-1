"use client";

/*
  O painel do bloco Loja: plataforma e domínio, produtos (com destaque),
  o checkout ligado e as métricas. Mesma casca do publicador. Só
  interface (Fase 1).
*/

import * as React from "react";
import { BarChart3, CreditCard, Package, Plus, Store } from "lucide-react";

import { DOMINIOS_VPS } from "@/features/vps/catalogo-demo";
import type { FunnelEdge, FunnelNode } from "./funnel-model";
import { ROTULO_TIPO } from "./funnel-model";
import { MetricasAba } from "./page-metrics-tab";
import {
  PLATAFORMAS,
  nomeDaPlataforma,
  precoTxt,
  produtosDaVps,
  type DadosLoja,
  type ProdutoLoja,
} from "./store-model";

type Aba = "loja" | "produtos" | "checkout" | "metricas";

const ABAS: { id: Aba; rotulo: string; sub: string; cor: string; Icone: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: "loja", rotulo: "Loja", sub: "Plataforma, domínio e moeda", cor: "#f59e0b", Icone: Store },
  { id: "produtos", rotulo: "Produtos", sub: "O que a loja vende e qual produto este funil empurra", cor: "#00e559", Icone: Package },
  { id: "checkout", rotulo: "Checkout", sub: "Para onde vai quem clica em comprar", cor: "#38bdf8", Icone: CreditCard },
  { id: "metricas", rotulo: "Métricas", sub: "Visitas, cliques em comprar e até onde rolam", cor: "#a78bfa", Icone: BarChart3 },
];

export function StorePanel({
  node,
  nodes,
  edges,
  onNome,
  onChange,
  onFechar,
  onIrPara,
  onCriarCheckout,
}: {
  node: FunnelNode;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  onNome: (n: string) => void;
  onChange: (l: DadosLoja) => void;
  onFechar: () => void;
  onIrPara?: (id: string) => void;
  /** Cria um bloco Checkout já ligado à loja. */
  onCriarCheckout: () => void;
}) {
  const [aba, setAba] = React.useState<Aba>("loja");
  const seq = React.useRef(1);
  const loja: DadosLoja = node.loja ?? { plataforma: "vps", moeda: "BRL", produtos: [] };
  const set = (p: Partial<DadosLoja>) => onChange({ ...loja, ...p });
  const setProduto = (id: string, patch: Partial<ProdutoLoja>) =>
    set({ produtos: loja.produtos.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const novoProduto = () => {
    let id = "";
    do id = `p${seq.current++}`;
    while (loja.produtos.some((x) => x.id === id));
    set({ produtos: [...loja.produtos, { id, nome: "Novo produto", preco: 97, caminho: `/produto/${id}`, ativo: true }], destaqueId: loja.destaqueId ?? id });
  };
  const importarDaVps = () => {
    if (!loja.dominio) return;
    const novos = produtosDaVps(loja.dominio).filter((p) => !loja.produtos.some((x) => x.id === p.id));
    set({ produtos: [...loja.produtos, ...novos], destaqueId: loja.destaqueId ?? novos[0]?.id });
  };
  const checkouts = edges
    .filter((e) => e.source === node.id)
    .map((e) => nodes.find((n) => n.id === e.target))
    .filter((n): n is FunnelNode => Boolean(n && (n.type === "checkout" || n.type === "upsell")));
  const destaque = loja.produtos.find((p) => p.id === loja.destaqueId);
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const plat = PLATAFORMAS.find((p) => p.id === loja.plataforma) ?? PLATAFORMAS[0];

  return (
    <aside className="pub pub--loja" aria-label="Loja" onPointerDown={(e) => e.stopPropagation()}>
      <header className="pub__head">
        <div className="pub__head-id">
          <span className="pub__badge" data-on={loja.produtos.length > 0 || undefined}>
            {nomeDaPlataforma(loja.plataforma)}
          </span>
          <input className="pub__nome" value={node.title} aria-label="Nome da loja" maxLength={120} onChange={(e) => onNome(e.target.value)} />
        </div>
        <button type="button" className="pub__x" aria-label="Fechar" onClick={onFechar}>✕</button>
      </header>
      <div className="pub__url">{loja.dominio ? `https://${loja.dominio}` : "— escolha o domínio da loja"}</div>

      <div className="pub__body">
        <nav className="pub__rail" aria-label="Abas da loja">
          {ABAS.map((a) => (
            <button key={a.id} type="button" className="pub__rail-btn" data-on={aba === a.id || undefined} style={{ "--aba-cor": a.cor } as React.CSSProperties} onClick={() => setAba(a.id)} title={a.rotulo} aria-label={a.rotulo}>
              <span className="pub__rail-ic" aria-hidden><a.Icone size={16} strokeWidth={2} /></span>
              <span className="pub__rail-lbl">{a.rotulo}</span>
            </button>
          ))}
        </nav>
        <div className="pub__corpo">
          <div className="pub__sec" style={{ "--aba-cor": abaAtual.cor } as React.CSSProperties}>
            <span className="pub__sec-badge" aria-hidden><abaAtual.Icone size={18} strokeWidth={2} /></span>
            <span className="pub__sec-txt">
              <b className="pub__sec-titulo">{abaAtual.rotulo}</b>
              <span className="pub__sec-sub">{abaAtual.sub}</span>
            </span>
          </div>

          {aba === "loja" && (
            <>
              <div className="pub__campo">
                <span>Plataforma</span>
                <div className="pub__chips">
                  {PLATAFORMAS.map((p) => (
                    <button key={p.id} type="button" className="pub__chip" data-on={loja.plataforma === p.id || undefined} aria-pressed={loja.plataforma === p.id} onClick={() => set({ plataforma: p.id, dominio: p.id === "vps" ? loja.dominio : undefined })}>
                      {p.nome}
                    </button>
                  ))}
                </div>
                <small className="pub__hint">{plat.dica}</small>
              </div>
              {loja.plataforma === "vps" ? (
                <div className="pub__campo">
                  <span>Domínio na VPS</span>
                  <div className="pub__chips">
                    {DOMINIOS_VPS.map((d) => (
                      <button key={d.host} type="button" className="pub__chip" data-on={loja.dominio === d.host || undefined} aria-pressed={loja.dominio === d.host} onClick={() => set({ dominio: d.host })}>
                        <span className="pub__chip-dot" data-estado={d.estado} aria-hidden />
                        {d.host}
                      </button>
                    ))}
                  </div>
                  {loja.dominio && produtosDaVps(loja.dominio).length > 0 && (
                    <button type="button" className="pub__btn" onClick={importarDaVps}>
                      Importar os {produtosDaVps(loja.dominio).length} produtos que já estão em {loja.dominio}
                    </button>
                  )}
                </div>
              ) : (
                <label className="pub__campo">
                  <span>Endereço da loja</span>
                  <input className="pub__input" value={loja.dominio ?? ""} placeholder={plat.exemplo} maxLength={200} onChange={(e) => set({ dominio: e.target.value.trim().replace(/^https?:\/\//, "") || undefined })} />
                  <small className="pub__hint">Só o endereço, sem https://. A conexão real com a plataforma entra na Fase 2.</small>
                </label>
              )}
              <div className="pub__campo">
                <span>Moeda</span>
                <div className="pub__chips">
                  {(["BRL", "USD"] as const).map((m) => (
                    <button key={m} type="button" className="pub__chip" data-on={loja.moeda === m || undefined} aria-pressed={loja.moeda === m} onClick={() => set({ moeda: m })}>
                      {m === "BRL" ? "R$ Real" : "US$ Dólar"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {aba === "produtos" && (
            <>
              <div className="rdp__topo">
                <span className="pub__hint">
                  {loja.produtos.length === 0 ? "Nenhum produto ainda." : `${loja.produtos.length} ${loja.produtos.length === 1 ? "produto" : "produtos"}. Marque o destaque: é o que este funil empurra.`}
                </span>
                <button type="button" className="pub__btn rdp__add" onClick={novoProduto}>
                  <Plus size={14} strokeWidth={2.4} /> Produto
                </button>
              </div>
              {loja.plataforma === "vps" && loja.dominio && loja.produtos.length === 0 && produtosDaVps(loja.dominio).length > 0 && (
                <button type="button" className="pub__btn" onClick={importarDaVps}>Importar os produtos de {loja.dominio}</button>
              )}
              {loja.produtos.map((p) => (
                <section key={p.id} className="pub__campo stp__produto" data-off={!p.ativo || undefined} data-destaque={p.id === loja.destaqueId || undefined}>
                  <div className="stp__produto-topo">
                    <button type="button" className="stp__destaque" aria-pressed={p.id === loja.destaqueId} title="Produto em destaque deste funil" onClick={() => set({ destaqueId: p.id })}>
                      {p.id === loja.destaqueId ? "★ Destaque" : "☆ Destacar"}
                    </button>
                    <button type="button" className="stp__produto-x" aria-label={`Remover ${p.nome}`} onClick={() => set({ produtos: loja.produtos.filter((x) => x.id !== p.id), destaqueId: loja.destaqueId === p.id ? undefined : loja.destaqueId })}>✕</button>
                  </div>
                  <div className="stp__produto-grid">
                    <label>
                      <span>Nome</span>
                      <input className="pub__input" value={p.nome} maxLength={120} onChange={(e) => setProduto(p.id, { nome: e.target.value })} />
                    </label>
                    <label>
                      <span>Preço ({loja.moeda === "USD" ? "US$" : "R$"})</span>
                      <input className="pub__input" type="number" min={0} value={p.preco} onChange={(e) => setProduto(p.id, { preco: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="stp__produto-caminho">
                      <span>Caminho na loja</span>
                      <input className="pub__input" value={p.caminho} maxLength={300} onChange={(e) => setProduto(p.id, { caminho: e.target.value })} />
                    </label>
                  </div>
                  <button type="button" className="pub__toggle" role="switch" aria-checked={p.ativo} onClick={() => setProduto(p.id, { ativo: !p.ativo })}>
                    <span className="pub__toggle-track" data-on={p.ativo || undefined}><span className="pub__toggle-knob" /></span>
                    <span className="pub__toggle-txt">{p.ativo ? "À venda" : "Pausado"}<small>Pausado: continua na lista, mas fora da loja.</small></span>
                  </button>
                </section>
              ))}
            </>
          )}

          {aba === "checkout" && (
            <>
              <div className="pub__campo">
                <span>Checkout ligado ({checkouts.length})</span>
                {checkouts.length === 0 && (
                  <>
                    <small className="pub__hint">Nenhum checkout ligado a esta loja. Puxe uma linha até um bloco Checkout, ou crie um já ligado:</small>
                    <button type="button" className="pub__btn rdp__add" onClick={onCriarCheckout}>
                      <Plus size={14} strokeWidth={2.4} /> Criar Checkout ligado à loja
                    </button>
                  </>
                )}
                {checkouts.map((c) => (
                  <div key={c.id} className="blk__lig">
                    <span className="blk__lig-lado" aria-hidden>→</span>
                    <span className="blk__lig-nome">{c.title} <small>{ROTULO_TIPO[c.type]}</small></span>
                    {onIrPara && <button type="button" className="blk__lig-ver" onClick={() => onIrPara(c.id)}>Ver no quadro ↗</button>}
                  </div>
                ))}
              </div>
              <div className="pub__campo">
                <span>O que o checkout vende</span>
                <p className="blk__sobre-p">
                  {destaque ? <>O produto em destaque é <b>{destaque.nome}</b> por <b>{precoTxt(destaque.preco, loja.moeda)}</b>. Na aba Previsão, use esse preço no bloco Checkout ligado.</> : "Marque um produto em destaque na aba Produtos para o funil saber o que empurra."}
                </p>
              </div>
              <small className="pub__hint">A ligação real com o checkout (carrinho, pagamento) entra na Fase 2, junto com a plataforma escolhida.</small>
            </>
          )}

          {aba === "metricas" && <MetricasAba seed={loja.dominio ?? node.title} />}
        </div>
      </div>

      <footer className="pub__foot">
        <span className="pub__foot-vps"><span className="pub__vps-dot" aria-hidden />Conexão real com a loja na Fase 2</span>
        <button type="button" className="pub__publicar" disabled>🛍 Conectar</button>
      </footer>
    </aside>
  );
}
