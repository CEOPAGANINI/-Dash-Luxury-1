"use client";

import * as React from "react";
import { Check, GripVertical, Lock, Plus, RotateCcw, ShieldCheck, Timer, Trash2 } from "lucide-react";

import { formatCurrency } from "@/features/unified-dashboard/formatters";
import { moverNaOrdem } from "@/features/ads/metrics-order-store";

import {
  CAMPOS_DO_CHECKOUT,
  CONFIG_PADRAO,
  LAYOUTS,
  PAGAMENTOS,
  TELAS,
  camposVisiveis,
  campoEhFixo,
  completarConfig,
  passosDoCheckout,
  type CampoId,
  type CheckoutConfig,
  type LayoutId,
  type PagamentoId,
  type TelaId,
} from "./checkout-config";
import { useCheckoutDraft } from "./checkout-editor-store";

/*
  O editor do checkout: à esquerda os controles, à direita a página como
  ela vai ficar, em computador, tablet ou celular.

  Tudo o que se mexe aparece na prévia no mesmo instante. Nada de menus
  suspensos: tudo botão em bloco, como o resto do painel. O que se
  guarda é a mesma configuração que a página do checkout lê.
*/

const dinheiro = (cents: number) => formatCurrency(cents / 100, cents % 100 === 0 ? 0 : 2);

export function CheckoutEditor({ inicial, nome }: { inicial?: unknown; nome?: string }) {
  /* A arrumação vive num cofre do navegador: volta ao recarregar e não
     se perde ao trocar de página. Com um checkout escolhido, o que vem
     do banco manda no primeiro desenho. */
  const cofre = useCheckoutDraft();
  const config = inicial === undefined ? cofre.config : completarConfig(inicial);
  const [tela, setTela] = React.useState<TelaId>("computador");
  const [arrastando, setArrastando] = React.useState<CampoId | null>(null);

  const mexer = React.useCallback(
    (muda: (c: CheckoutConfig) => CheckoutConfig) => {
      cofre.guardar(muda(config));
    },
    [cofre, config],
  );

  const campo = (id: CampoId) => config.campos.find((c) => c.id === id)!;

  return (
    <div className="dash-checkout-editor">
      {/* Os controles. */}
      <div className="dash-checkout-controles">
        <section aria-label="Formato da página">
          <h2>Formato</h2>
          <div className="dash-checkout-opcoes">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={config.layout === l.id}
                data-escolhido={config.layout === l.id ? "true" : undefined}
                onClick={() => mexer((c) => ({ ...c, layout: l.id as LayoutId }))}
              >
                <b>{l.rotulo}</b>
                <span>{l.legenda}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Campos do formulário">
          <h2>Campos</h2>
          <p className="dash-checkout-dica">Arraste para mudar a ordem. Nome e e-mail não se desligam.</p>
          <ul className="dash-checkout-campos">
            {config.campos.map((c) => {
              const meta = CAMPOS_DO_CHECKOUT.find((x) => x.id === c.id)!;
              const fixo = campoEhFixo(c.id);
              return (
                <li
                  key={c.id}
                  data-campo={c.id}
                  data-arrastando={arrastando === c.id ? "true" : undefined}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.id);
                    setArrastando(c.id);
                  }}
                  onDragEnd={() => setArrastando(null)}
                  onDragOver={(e) => {
                    if (!arrastando || arrastando === c.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    mexer((atual) => ({ ...atual, campos: moverNaOrdem(atual.campos, campo(arrastando), campo(c.id)) }));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastando(null);
                  }}
                >
                  <GripVertical aria-hidden="true" className="dash-checkout-pega" />
                  <b>{meta.rotulo}</b>
                  {fixo ? (
                    <span className="dash-checkout-fixo">
                      <Lock aria-hidden="true" />
                      Sempre
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-pressed={c.ativo}
                        data-escolhido={c.ativo ? "true" : undefined}
                        onClick={() => mexer((a) => ({ ...a, campos: a.campos.map((x) => (x.id === c.id ? { ...x, ativo: !x.ativo, obrigatorio: x.ativo ? false : x.obrigatorio } : x)) }))}
                      >
                        {c.ativo ? "No formulário" : "Escondido"}
                      </button>
                      <button
                        type="button"
                        aria-pressed={c.obrigatorio}
                        data-escolhido={c.obrigatorio ? "true" : undefined}
                        disabled={!c.ativo}
                        onClick={() => mexer((a) => ({ ...a, campos: a.campos.map((x) => (x.id === c.id ? { ...x, obrigatorio: !x.obrigatorio } : x)) }))}
                      >
                        {c.obrigatorio ? "Obrigatório" : "Opcional"}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Formas de pagamento">
          <h2>Pagamento</h2>
          <div className="dash-checkout-opcoes">
            {PAGAMENTOS.map((p) => {
              const ligado = config.pagamentos.includes(p.id as PagamentoId);
              const unico = ligado && config.pagamentos.length === 1;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={ligado}
                  data-escolhido={ligado ? "true" : undefined}
                  disabled={unico}
                  title={unico ? "O checkout precisa de pelo menos uma forma de pagamento" : undefined}
                  onClick={() =>
                    mexer((c) => ({
                      ...c,
                      pagamentos: ligado ? c.pagamentos.filter((x) => x !== p.id) : [...c.pagamentos, p.id as PagamentoId],
                    }))
                  }
                >
                  <b>{p.rotulo}</b>
                  <span>{ligado ? "No checkout" : "Fora"}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Textos">
          <h2>Textos</h2>
          <label>
            <span>Título</span>
            <input value={config.textos.titulo} maxLength={80} onChange={(e) => mexer((c) => ({ ...c, textos: { ...c.textos, titulo: e.target.value } }))} />
          </label>
          <label>
            <span>Subtítulo</span>
            <input value={config.textos.subtitulo} maxLength={140} onChange={(e) => mexer((c) => ({ ...c, textos: { ...c.textos, subtitulo: e.target.value } }))} />
          </label>
          <label>
            <span>Texto do botão</span>
            <input value={config.textos.botao} maxLength={40} onChange={(e) => mexer((c) => ({ ...c, textos: { ...c.textos, botao: e.target.value } }))} />
          </label>
        </section>

        <section aria-label="Cores">
          <h2>Cores</h2>
          <div className="dash-checkout-cores">
            {(["fundo", "texto", "destaque"] as const).map((chave) => (
              <label key={chave}>
                <span>{chave === "fundo" ? "Fundo" : chave === "texto" ? "Texto" : "Destaque"}</span>
                <input
                  type="color"
                  value={config.cores[chave]}
                  aria-label={`Cor de ${chave}`}
                  onChange={(e) => mexer((c) => ({ ...c, cores: { ...c.cores, [chave]: e.target.value } }))}
                />
              </label>
            ))}
          </div>
        </section>

        <section aria-label="Confiança e urgência">
          <h2>Confiança</h2>
          <div className="dash-checkout-opcoes">
            {(
              [
                ["compraSegura", "Selo de compra segura"],
                ["garantia", "Selo de garantia"],
                ["ssl", "Selo de conexão segura"],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                type="button"
                aria-pressed={config.selos[chave]}
                data-escolhido={config.selos[chave] ? "true" : undefined}
                onClick={() => mexer((c) => ({ ...c, selos: { ...c.selos, [chave]: !c.selos[chave] } }))}
              >
                <b>{rotulo}</b>
                <span>{config.selos[chave] ? "Aparece" : "Escondido"}</span>
              </button>
            ))}
          </div>
          <label>
            <span>Dias de garantia</span>
            <input
              type="number"
              min={0}
              max={365}
              value={config.garantiaDias}
              onChange={(e) => mexer((c) => ({ ...c, garantiaDias: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) }))}
            />
          </label>
          <div className="dash-checkout-opcoes">
            <button
              type="button"
              aria-pressed={config.contador.ativo}
              data-escolhido={config.contador.ativo ? "true" : undefined}
              onClick={() => mexer((c) => ({ ...c, contador: { ...c.contador, ativo: !c.contador.ativo } }))}
            >
              <b>Contagem regressiva</b>
              <span>{config.contador.ativo ? `${config.contador.minutos} minutos` : "Desligada"}</span>
            </button>
          </div>
          {config.contador.ativo && (
            <label>
              <span>Minutos</span>
              <input
                type="number"
                min={1}
                max={120}
                value={config.contador.minutos}
                onChange={(e) => mexer((c) => ({ ...c, contador: { ...c.contador, minutos: Math.max(1, Math.min(120, Math.round(Number(e.target.value) || 1))) } }))}
              />
            </label>
          )}
        </section>

        <section aria-label="Order bump">
          <h2>Order bump</h2>
          <div className="dash-checkout-opcoes">
            <button
              type="button"
              aria-pressed={config.orderBump.ativo}
              data-escolhido={config.orderBump.ativo ? "true" : undefined}
              onClick={() => mexer((c) => ({ ...c, orderBump: { ...c.orderBump, ativo: !c.orderBump.ativo } }))}
            >
              <b>Oferta no checkout</b>
              <span>{config.orderBump.ativo ? "Aparece" : "Escondida"}</span>
            </button>
          </div>
          {config.orderBump.ativo && (
            <>
              <label>
                <span>Título</span>
                <input value={config.orderBump.titulo} maxLength={80} onChange={(e) => mexer((c) => ({ ...c, orderBump: { ...c.orderBump, titulo: e.target.value } }))} />
              </label>
              <label>
                <span>Texto</span>
                <input value={config.orderBump.texto} maxLength={200} onChange={(e) => mexer((c) => ({ ...c, orderBump: { ...c.orderBump, texto: e.target.value } }))} />
              </label>
              <label>
                <span>Preço (R$)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={config.orderBump.precoCents / 100}
                  onChange={(e) => mexer((c) => ({ ...c, orderBump: { ...c.orderBump, precoCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) } }))}
                />
              </label>
            </>
          )}
        </section>

        <section aria-label="Depoimentos">
          <h2>Depoimentos</h2>
          <ul className="dash-checkout-depoimentos">
            {config.depoimentos.map((d, i) => (
              <li key={i}>
                <input
                  value={d.nome}
                  maxLength={60}
                  aria-label={`Nome do depoimento ${i + 1}`}
                  placeholder="Nome"
                  onChange={(e) => mexer((c) => ({ ...c, depoimentos: c.depoimentos.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) }))}
                />
                <input
                  value={d.texto}
                  maxLength={240}
                  aria-label={`Texto do depoimento ${i + 1}`}
                  placeholder="O que essa pessoa disse"
                  onChange={(e) => mexer((c) => ({ ...c, depoimentos: c.depoimentos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) }))}
                />
                <button type="button" aria-label={`Apagar o depoimento ${i + 1}`} onClick={() => mexer((c) => ({ ...c, depoimentos: c.depoimentos.filter((_, j) => j !== i) }))}>
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {config.depoimentos.length < 6 && (
            <button
              type="button"
              className="dash-checkout-adicionar"
              onClick={() => mexer((c) => ({ ...c, depoimentos: [...c.depoimentos, { nome: "Cliente", texto: "Chegou rápido e é exatamente como na página." }] }))}
            >
              <Plus aria-hidden="true" />
              Novo depoimento
            </button>
          )}
        </section>

        <div className="dash-checkout-rodape">
          <button type="button" onClick={() => mexer(() => CONFIG_PADRAO)}>
            <RotateCcw aria-hidden="true" />
            Voltar ao padrão
          </button>
          <span role="status">{cofre.notice || "As alterações ficam guardadas neste navegador"}</span>
        </div>
      </div>

      {/* A prévia. */}
      <div className="dash-checkout-previa">
        <div className="dash-checkout-telas" role="group" aria-label="Tamanho da tela">
          {TELAS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tela === t.id}
              data-escolhido={tela === t.id ? "true" : undefined}
              onClick={() => setTela(t.id)}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        <div className="dash-checkout-palco" data-tela={tela}>
          <PreviaDoCheckout config={config} nome={nome} largura={TELAS.find((t) => t.id === tela)!.largura} />
        </div>
      </div>
    </div>
  );
}

/** A página do checkout como ela vai ficar, com a configuração de agora. */
export function PreviaDoCheckout({ config, nome, largura }: { config: CheckoutConfig; nome?: string; largura: number }) {
  const campos = camposVisiveis(config);
  const passos = passosDoCheckout(config);
  return (
    <div
      className="dash-checkout-pagina"
      role="group"
      aria-label="Prévia do checkout"
      style={{
        width: largura,
        maxWidth: "100%",
        background: config.cores.fundo,
        color: config.cores.texto,
        ["--destaque" as string]: config.cores.destaque,
      }}
    >
      {config.contador.ativo && (
        <p className="dash-checkout-contador" style={{ background: config.cores.destaque }}>
          <Timer aria-hidden="true" />
          Oferta reservada por {config.contador.minutos}:00
        </p>
      )}
      <header>
        <h3>{config.textos.titulo}</h3>
        {config.textos.subtitulo && <p>{config.textos.subtitulo}</p>}
        {nome && <p className="dash-checkout-produto">{nome}</p>}
      </header>
      {passos.length > 1 && (
        <ol className="dash-checkout-passos">
          {passos.map((p, i) => (
            <li key={p} data-atual={i === 0 ? "true" : undefined}>
              <i>{i + 1}</i>
              {p}
            </li>
          ))}
        </ol>
      )}
      <ul className="dash-checkout-formulario">
        {campos.map((c) => (
          <li key={c.id} data-campo={c.id}>
            <span>
              {c.rotulo}
              {c.obrigatorio && <i aria-label="obrigatório"> *</i>}
            </span>
            <em />
          </li>
        ))}
      </ul>
      <ul className="dash-checkout-pagamentos">
        {config.pagamentos.map((p) => (
          <li key={p} data-pagamento={p}>
            {PAGAMENTOS.find((x) => x.id === p)?.rotulo}
          </li>
        ))}
      </ul>
      {config.orderBump.ativo && (
        <div className="dash-checkout-bump" style={{ borderColor: config.cores.destaque }}>
          <Check aria-hidden="true" />
          <div>
            <b>{config.orderBump.titulo}</b>
            <span>{config.orderBump.texto}</span>
          </div>
          <b className="dash-checkout-bump-preco">{dinheiro(config.orderBump.precoCents)}</b>
        </div>
      )}
      <button type="button" className="dash-checkout-botao" style={{ background: config.cores.destaque }} tabIndex={-1}>
        {config.textos.botao}
      </button>
      {config.textos.seguranca && <p className="dash-checkout-seguranca">{config.textos.seguranca}</p>}
      {(config.selos.compraSegura || config.selos.garantia || config.selos.ssl) && (
        <ul className="dash-checkout-selos">
          {config.selos.compraSegura && (
            <li>
              <ShieldCheck aria-hidden="true" />
              Compra segura
            </li>
          )}
          {config.selos.garantia && (
            <li>
              <ShieldCheck aria-hidden="true" />
              {config.garantiaDias} dias de garantia
            </li>
          )}
          {config.selos.ssl && (
            <li>
              <Lock aria-hidden="true" />
              Conexão segura
            </li>
          )}
        </ul>
      )}
      {config.depoimentos.length > 0 && (
        <ul className="dash-checkout-depoimentos-previa">
          {config.depoimentos.map((d, i) => (
            <li key={i}>
              <q>{d.texto}</q>
              <cite>{d.nome}</cite>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
