"use client";

/*
  O painel do bloco Loja: plataforma e domínio, produtos (com destaque),
  o checkout ligado e as métricas. Mesma casca do publicador. Só
  interface (Fase 1).
*/

import * as React from "react";
import { BarChart3, CreditCard, Package, Plus, Store } from "lucide-react";

import {
  forgetPreparedPageZip,
  preparePageZip,
  type PageZipScope,
} from "./page-zip";
import { usePageZip } from "./use-page-zip";
import { deletePackage } from "./package-cloud";
import type { FunnelEdge, FunnelNode } from "./funnel-model";
import { ROTULO_TIPO } from "./funnel-model";
import { MetricasAba } from "./page-metrics-tab";
import {
  PLATAFORMAS,
  nomeDaPlataforma,
  nomeDoProduto,
  normalizarSlug,
  precoTxt,
  tamanhoTxt,
  type DadosLoja,
  type ProdutoLoja,
} from "./store-model";

type Aba = "loja" | "produtos" | "checkout" | "metricas";

const ABAS: {
  id: Aba;
  rotulo: string;
  sub: string;
  cor: string;
  Icone: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  {
    id: "loja",
    rotulo: "Loja",
    sub: "Plataforma, domínio e moeda",
    cor: "#f59e0b",
    Icone: Store,
  },
  {
    id: "produtos",
    rotulo: "Produtos",
    sub: "Uma faixa por produto: só o slug e o ZIP da landing page",
    cor: "#00e559",
    Icone: Package,
  },
  {
    id: "checkout",
    rotulo: "Checkout",
    sub: "Para onde vai quem clica em comprar",
    cor: "#38bdf8",
    Icone: CreditCard,
  },
  {
    id: "metricas",
    rotulo: "Métricas",
    sub: "Visitas, cliques em comprar e até onde rolam",
    cor: "#a78bfa",
    Icone: BarChart3,
  },
];

export function StorePanel({
  storageId,
  funnelId,
  node,
  nodes,
  edges,
  onNome,
  onChange,
  onFechar,
  onIrPara,
  onCriarCheckout,
  onEditarConteudo,
  onPublicarSite,
}: {
  storageId: string;
  funnelId: string;
  node: FunnelNode;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  onNome: (n: string) => void;
  onChange: (l: DadosLoja) => void;
  onFechar: () => void;
  onIrPara?: (id: string) => void;
  /** Cria um bloco Checkout já ligado à loja. */
  onCriarCheckout: () => void;
  onEditarConteudo?: () => void;
  onPublicarSite?: () => void;
}) {
  const [aba, setAba] = React.useState<Aba>("loja");
  const [faixaAberta, setFaixaAberta] = React.useState<string | null>(null);
  const seq = React.useRef(1);
  const loja: DadosLoja = node.loja ?? {
    plataforma: "vps",
    moeda: "BRL",
    produtos: [],
  };
  const set = (p: Partial<DadosLoja>) => onChange({ ...loja, ...p });
  const setProduto = (id: string, patch: Partial<ProdutoLoja>) =>
    set({
      produtos: loja.produtos.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    });
  const novoProduto = () => {
    let id = "";
    do id = `p${seq.current++}`;
    while (loja.produtos.some((x) => x.id === id));
    set({
      produtos: [
        ...loja.produtos,
        { id, nome: "", preco: 97, caminho: "", ativo: true },
      ],
      destaqueId: loja.destaqueId ?? id,
    });
    setFaixaAberta(id);
  };
  const removerProduto = (id: string) => {
    forgetPreparedPageZip({
      storageId,
      funnelId,
      nodeId: node.id,
      productId: id,
    });
    set({
      produtos: loja.produtos.filter((x) => x.id !== id),
      destaqueId: loja.destaqueId === id ? undefined : loja.destaqueId,
    });
  };
  const checkouts = edges
    .filter((e) => e.source === node.id)
    .map((e) => nodes.find((n) => n.id === e.target))
    .filter((n): n is FunnelNode =>
      Boolean(n && (n.type === "checkout" || n.type === "upsell")),
    );
  const destaque = loja.produtos.find((p) => p.id === loja.destaqueId);
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const plat =
    PLATAFORMAS.find((p) => p.id === loja.plataforma) ?? PLATAFORMAS[0];

  return (
    <aside
      className="pub pub--loja"
      aria-label="Loja"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="pub__head">
        <div className="pub__head-id">
          <span
            className="pub__badge"
            data-on={loja.produtos.length > 0 || undefined}
          >
            {nomeDaPlataforma(loja.plataforma)}
          </span>
          <input
            className="pub__nome"
            value={node.title}
            aria-label="Nome da loja"
            maxLength={120}
            onChange={(e) => onNome(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="pub__x"
          aria-label="Fechar"
          onClick={onFechar}
        >
          ✕
        </button>
      </header>
      <div className="pub__url">
        {loja.dominio
          ? `https://${loja.dominio}`
          : "— escolha o domínio da loja"}
      </div>

      <div className="pub__body">
        <nav className="pub__rail" aria-label="Abas da loja">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="pub__rail-btn"
              data-on={aba === a.id || undefined}
              style={{ "--aba-cor": a.cor } as React.CSSProperties}
              onClick={() => setAba(a.id)}
              title={a.rotulo}
              aria-label={a.rotulo}
            >
              <span className="pub__rail-ic" aria-hidden>
                <a.Icone size={16} strokeWidth={2} />
              </span>
              <span className="pub__rail-lbl">{a.rotulo}</span>
            </button>
          ))}
        </nav>
        <div className="pub__corpo">
          <div
            className="pub__sec"
            style={{ "--aba-cor": abaAtual.cor } as React.CSSProperties}
          >
            <span className="pub__sec-badge" aria-hidden>
              <abaAtual.Icone size={18} strokeWidth={2} />
            </span>
            <span className="pub__sec-txt">
              <b className="pub__sec-titulo">{abaAtual.rotulo}</b>
              <span className="pub__sec-sub">{abaAtual.sub}</span>
            </span>
          </div>

          {aba === "loja" && (
            <>
              <div className="pub__campo">
                <span>Página inicial da loja</span>
                <p className="pub__hint">
                  Importe HTML/CSS/JavaScript ou ZIP. Coleções, categorias,
                  carrinho e ofertas são páginas conectadas do mesmo funil. A
                  publicação usa um ZIP único e caminhos exclusivos.
                </p>
                <button
                  type="button"
                  className="pub__btn"
                  onClick={onEditarConteudo}
                >
                  Editar conteúdo ou importar ZIP da loja
                </button>
              </div>
              <div className="pub__campo">
                <span>Plataforma</span>
                <div className="pub__chips">
                  {PLATAFORMAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="pub__chip"
                      data-on={loja.plataforma === p.id || undefined}
                      aria-pressed={loja.plataforma === p.id}
                      onClick={() =>
                        set({
                          plataforma: p.id,
                          dominio: p.id === "vps" ? loja.dominio : undefined,
                        })
                      }
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
                <small className="pub__hint">{plat.dica}</small>
              </div>
              <label className="pub__campo">
                <span>Endereço da loja</span>
                <input
                  className="pub__input"
                  value={loja.dominio ?? ""}
                  placeholder={plat.exemplo}
                  maxLength={200}
                  onChange={(e) =>
                    set({
                      dominio:
                        e.target.value.trim().replace(/^https?:\/\//, "") ||
                        undefined,
                    })
                  }
                />
                <small className="pub__hint">
                  Só o endereço, sem https://. Para uma loja própria, escolha o
                  site real da VPS ao publicar. Plataformas externas continuam
                  como destinos por URL; isto não conecta suas APIs.
                </small>
              </label>
              <div className="pub__campo">
                <span>Moeda</span>
                <div className="pub__chips">
                  {(["BRL", "USD"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="pub__chip"
                      data-on={loja.moeda === m || undefined}
                      aria-pressed={loja.moeda === m}
                      onClick={() => set({ moeda: m })}
                    >
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
                  {loja.produtos.length === 0
                    ? "Nenhuma faixa ainda. Cada faixa é um produto."
                    : `${loja.produtos.length} ${loja.produtos.length === 1 ? "faixa" : "faixas"}. Abra uma (→) para pôr o slug e o ZIP.`}
                </span>
                <button
                  type="button"
                  className="pub__btn rdp__add"
                  onClick={novoProduto}
                >
                  <Plus size={14} strokeWidth={2.4} /> Produto
                </button>
              </div>
              <div className="stp__faixas">
                {loja.produtos.map((p, i) => (
                  <FaixaProduto
                    key={p.id}
                    scope={{
                      storageId,
                      funnelId,
                      nodeId: node.id,
                      productId: p.id,
                    }}
                    p={p}
                    ordem={i + 1}
                    dominio={loja.dominio}
                    destaque={p.id === loja.destaqueId}
                    aberta={faixaAberta === p.id}
                    onAbrir={() =>
                      setFaixaAberta(faixaAberta === p.id ? null : p.id)
                    }
                    onPatch={(patch) => setProduto(p.id, patch)}
                    onDestacar={() => set({ destaqueId: p.id })}
                    onRemover={() => removerProduto(p.id)}
                  />
                ))}
              </div>
            </>
          )}

          {aba === "checkout" && (
            <>
              <div className="pub__campo">
                <span>Checkout ligado ({checkouts.length})</span>
                {checkouts.length === 0 && (
                  <>
                    <small className="pub__hint">
                      Nenhum checkout ligado a esta loja. Puxe uma linha até um
                      bloco Checkout, ou crie um já ligado:
                    </small>
                    <button
                      type="button"
                      className="pub__btn rdp__add"
                      onClick={onCriarCheckout}
                    >
                      <Plus size={14} strokeWidth={2.4} /> Criar Checkout ligado
                      à loja
                    </button>
                  </>
                )}
                {checkouts.map((c) => (
                  <div key={c.id} className="blk__lig">
                    <span className="blk__lig-lado" aria-hidden>
                      →
                    </span>
                    <span className="blk__lig-nome">
                      {c.title} <small>{ROTULO_TIPO[c.type]}</small>
                    </span>
                    {onIrPara && (
                      <button
                        type="button"
                        className="blk__lig-ver"
                        onClick={() => onIrPara(c.id)}
                      >
                        Ver no quadro ↗
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="pub__campo">
                <span>O que o checkout vende</span>
                <p className="blk__sobre-p">
                  {destaque ? (
                    <>
                      O produto em destaque é <b>{nomeDoProduto(destaque)}</b>{" "}
                      por <b>{precoTxt(destaque.preco, loja.moeda)}</b>. Na aba
                      Previsão, use esse preço no bloco Checkout ligado.
                    </>
                  ) : (
                    "Marque um produto em destaque na aba Produtos para o funil saber o que empurra."
                  )}
                </p>
              </div>
              <small className="pub__hint">
                A ligação real com o checkout (carrinho, pagamento) entra na
                Fase 2, junto com a plataforma escolhida.
              </small>
            </>
          )}

          {aba === "metricas" && (
            <MetricasAba seed={loja.dominio ?? node.title} />
          )}
        </div>
      </div>

      <footer className="pub__foot">
        <span className="pub__foot-vps">
          <span className="pub__vps-dot" aria-hidden />
          Loja estática e páginas do funil · pagamentos exigem checkout
          integrado
        </span>
        <button
          type="button"
          className="pub__publicar"
          onClick={onPublicarSite}
        >
          Publicar loja e funil
        </button>
      </footer>
    </aside>
  );
}

/*
  Uma faixa de produto, no desenho das faixas de campanha: ícone, nome
  numa linha só, três quadradinhos de estado (à venda · slug · landing
  page), a ordem e a seta. Abre para baixo com só duas coisas: o slug e o
  ZIP da landing page.
*/
function FaixaProduto({
  scope,
  p,
  ordem,
  dominio,
  destaque,
  aberta,
  onAbrir,
  onPatch,
  onDestacar,
  onRemover,
}: {
  scope: PageZipScope;
  p: ProdutoLoja;
  ordem: number;
  dominio?: string;
  destaque: boolean;
  aberta: boolean;
  onAbrir: () => void;
  onPatch: (patch: Partial<ProdutoLoja>) => void;
  onDestacar: () => void;
  onRemover: () => void;
}) {
  const [arrastando, setArrastando] = React.useState(false);
  const [zipError, setZipError] = React.useState("");
  const [validatingZip, setValidatingZip] = React.useState(false);
  const validating = React.useRef(false);
  const mounted = React.useRef(false);
  const patch = React.useRef(onPatch);
  React.useEffect(() => {
    patch.current = onPatch;
  }, [onPatch]);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const preparedZip = usePageZip({
    ...scope,
    funnelId: p.zip?.sourceFunnelId ?? scope.funnelId,
  });
  const inputZip = React.useRef<HTMLInputElement>(null);
  const nome = nomeDoProduto(p);
  const temSlug = p.caminho.length > 1;
  const temZip = Boolean(preparedZip);
  const receberZip = async (f?: File) => {
    if (!f || validating.current) return;
    validating.current = true;
    setValidatingZip(true);
    setZipError("");
    try {
      const result = await preparePageZip(scope, f, { persist: true });
      if (mounted.current) patch.current({ zip: result.metadata });
    } catch (cause) {
      if (mounted.current)
        setZipError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível conferir este ZIP.",
        );
    } finally {
      validating.current = false;
      if (mounted.current) setValidatingZip(false);
    }
  };
  const estados: { id: string; on: boolean; cor: string; txt: string }[] = [
    {
      id: "venda",
      on: p.ativo,
      cor: "#00e559",
      txt: p.ativo ? "À venda" : "Pausado",
    },
    {
      id: "slug",
      on: temSlug,
      cor: "#38bdf8",
      txt: temSlug ? `Slug ${p.caminho}` : "Sem slug",
    },
    {
      id: "zip",
      on: temZip,
      cor: "#f59e0b",
      txt: temZip ? `Landing page: ${p.zip?.nome}` : "Sem landing page",
    },
  ];
  return (
    <section
      className="stp__faixa"
      data-aberta={aberta || undefined}
      data-off={!p.ativo || undefined}
      data-destaque={destaque || undefined}
    >
      <button
        type="button"
        className="stp__faixa-topo"
        aria-expanded={aberta}
        onClick={onAbrir}
        title={nome}
      >
        <span className="stp__faixa-ic" aria-hidden>
          <Package size={14} strokeWidth={2} />
        </span>
        <b className="stp__faixa-nome">{nome}</b>
        <span
          className="stp__faixa-estados"
          aria-label={estados.map((e) => e.txt).join(" · ")}
        >
          {estados.map((e) => (
            <i
              key={e.id}
              className="stp__faixa-estado"
              data-on={e.on || undefined}
              style={{ "--cor": e.cor } as React.CSSProperties}
              title={e.txt}
            />
          ))}
        </span>
        <span
          className="stp__faixa-conta"
          title={destaque ? "Destaque deste funil" : `Produto ${ordem}`}
        >
          {destaque ? "★" : ordem}
        </span>
        <span className="stp__faixa-seta" aria-hidden>
          →
        </span>
      </button>
      {aberta && (
        <div className="stp__faixa-corpo">
          <label className="stp__faixa-campo">
            <span>Slug (caminho na loja)</span>
            <div className="stp__slug">
              <span className="stp__slug-pre">{dominio ?? "loja"}/</span>
              <input
                className="pub__input"
                value={p.caminho.replace(/^\//, "")}
                placeholder="relogio-aviator"
                maxLength={120}
                spellCheck={false}
                aria-label="Slug do produto"
                onChange={(e) =>
                  onPatch({ caminho: normalizarSlug(e.target.value) })
                }
                onBlur={() => {
                  const limpo = normalizarSlug(p.caminho.replace(/[-/]+$/, ""));
                  if (limpo !== p.caminho) onPatch({ caminho: limpo });
                }}
              />
            </div>
          </label>
          <div className="stp__faixa-campo">
            <span>Landing page (ZIP)</span>
            <div
              className="pub__drop stp__drop"
              data-drag={arrastando || undefined}
              data-ok={temZip || undefined}
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              aria-disabled={validatingZip}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                void receberZip(e.dataTransfer.files?.[0]);
              }}
              onClick={() => {
                if (!validatingZip) inputZip.current?.click();
              }}
              onKeyDown={(e) => {
                if (!validatingZip && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  inputZip.current?.click();
                }
              }}
            >
              {p.zip ? (
                <>
                  <b>{preparedZip?.metadata.nome ?? p.zip.nome}</b>
                  <span>
                    {tamanhoTxt(preparedZip?.metadata.tamanho ?? p.zip.tamanho)}{" "}
                    ·{" "}
                    {preparedZip
                      ? "ZIP conferido ✓ — disponível nesta aba"
                      : "Anexe novamente — o rascunho não contém os arquivos"}
                  </span>
                </>
              ) : (
                <>
                  <b>
                    {validatingZip
                      ? "Conferindo arquivos…"
                      : "Arraste o ZIP da landing page"}
                  </b>
                  <span>
                    até 3 MB — index.html na raiz, sem PHP ou .htaccess
                  </span>
                </>
              )}
              <input
                ref={inputZip}
                type="file"
                accept=".zip"
                aria-label={`ZIP de ${nome}`}
                disabled={validatingZip}
                hidden
                onChange={(e) => {
                  void receberZip(e.target.files?.[0] ?? undefined);
                  e.target.value = "";
                }}
              />
            </div>
            {zipError ? (
              <p role="alert" className="pub__hint">
                {zipError}
              </p>
            ) : null}
            <small className="pub__hint">
              O ZIP conferido fica na sua conta e a página de produto é
              publicada no ZIP único. Pagamentos precisam de um checkout
              integrado; o ZIP não processa compras sozinho.
            </small>
          </div>
          <div className="stp__faixa-acoes">
            <button
              type="button"
              className="stp__destaque"
              aria-pressed={destaque}
              onClick={onDestacar}
            >
              {destaque ? "★ Destaque" : "☆ Destacar"}
            </button>
            <button
              type="button"
              className="stp__destaque"
              onClick={() => onPatch({ ativo: !p.ativo })}
            >
              {p.ativo ? "Pausar" : "Pôr à venda"}
            </button>
            <button
              type="button"
              className="stp__destaque stp__remover"
              disabled={validatingZip}
              onClick={() => {
                void (async () => {
                  setValidatingZip(true);
                  try {
                    if (
                      !p.zip?.sourceFunnelId ||
                      p.zip.sourceFunnelId === scope.funnelId
                    )
                      await deletePackage(scope);
                    onRemover();
                  } catch (cause) {
                    setZipError(
                      cause instanceof Error
                        ? cause.message
                        : "Não foi possível remover o produto.",
                    );
                  } finally {
                    setValidatingZip(false);
                  }
                })();
              }}
            >
              Remover
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
