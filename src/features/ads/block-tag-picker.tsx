"use client";

import * as React from "react";
import { Tag, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { CORES_TAG, corDaTag, useBlockTags, type CorTag } from "./block-tags-store";
import { PainelFlutuante } from "./painel-flutuante";

/*
  Os blocos do quadro não têm título: só a tag que o usuário escolher.
  Sem tag, fica um ícone discreto; clicar em qualquer ponto da faixa
  abre o menu do bloco — um painel flutuante preso ao cabeçalho, no
  mesmo desenho do painel da campanha: usar uma tag já criada (faixas
  com a cor e o nome), criar uma nova (nome e uma cor entre quinze
  faixas), apagar uma tag ou tirar a tag do bloco; e, por baixo, o que
  o quadro passar em `extra` (tamanho do bloco, novo bloco, apagar).
  Tudo fica neste navegador.
*/

export function TituloDoBloco({
  pilar,
  rotulo,
  extra,
}: {
  pilar: string;
  rotulo: string;
  /** O resto do menu do bloco (tamanho, novo, apagar), depois das tags; recebe como fechar o painel. */
  extra?: (fechar: () => void) => React.ReactNode;
}) {
  const { tags, tagDoBloco, criar, remover, atribuir, notice } = useBlockTags();
  const tag = tagDoBloco(pilar);
  const [ancora, setAncora] = React.useState<HTMLElement | null>(null);
  const [nome, setNome] = React.useState("");
  const [cor, setCor] = React.useState<CorTag>("branco");
  const [erro, setErro] = React.useState("");
  const raiz = React.useRef<HTMLDivElement>(null);
  const idPainel = React.useId();
  const aberto = ancora !== null;
  function fechar() {
    setAncora(null);
  }

  function alternar() {
    if (ancora) {
      setAncora(null);
      return;
    }
    // O painel gruda no cabeçalho inteiro do bloco (alfinete, tag e contagem).
    const cabecalho = raiz.current?.closest<HTMLElement>(".class-board-pilar-cabecalho") ?? raiz.current;
    setAncora(cabecalho ?? null);
  }

  function criarEUsar(e: React.FormEvent) {
    e.preventDefault();
    const id = criar(nome, cor);
    if (!id) {
      setErro(nome.trim() ? "Já existe uma tag com esse nome." : "Escreva o nome da tag.");
      return;
    }
    atribuir(pilar, id);
    setNome("");
    setErro("");
    setAncora(null);
  }

  return (
    <div ref={raiz} className="class-board-titulo min-w-0 flex-1">
      <button
        type="button"
        className="class-board-pilar-nome class-board-titulo-botao"
        aria-label={`Tag do bloco ${rotulo}${tag ? `: ${tag.nome}` : ""}`}
        title={tag ? `Tag "${tag.nome}". Clique para trocar.` : "Clique para pôr uma tag neste bloco."}
        aria-expanded={aberto}
        aria-controls={idPainel}
        data-com-tag={tag ? "true" : "false"}
        onClick={alternar}
      >
        {tag ? (
          <>
            <span className="class-board-tag-cor" style={{ background: corDaTag(tag.cor) }} aria-hidden="true" />
            <span className="min-w-0">{tag.nome}</span>
          </>
        ) : (
          <Tag className="size-3.5" aria-hidden="true" />
        )}
      </button>
      {ancora && (
        <PainelFlutuante id={idPainel} ancora={ancora} rotulo={`Bloco ${rotulo}`} onClose={fechar} larguraMinima={320} className="class-board-tags">
          {tags.length > 0 && (
            <ul className="class-board-tags-lista" aria-label="Tags criadas">
              {tags.map((t) => (
                <li key={t.id} className={cn(tag?.id === t.id && "is-atual")}>
                  <button
                    type="button"
                    className="class-board-tags-usar"
                    aria-label={`Usar tag ${t.nome}`}
                    aria-pressed={tag?.id === t.id}
                    style={{ ["--neon" as string]: corDaTag(t.cor) }}
                    onClick={() => { atribuir(pilar, t.id); setAncora(null); }}
                  >
                    <span aria-hidden="true" />
                    <span className="min-w-0 truncate">{t.nome}</span>
                  </button>
                  <button type="button" className="class-board-tags-apagar" aria-label={`Apagar tag ${t.nome}`} title="Apagar a tag de todos os blocos" onClick={() => remover(t.id)}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tag && (
            <button type="button" className="class-board-tags-limpar" onClick={() => { atribuir(pilar, null); setAncora(null); }}>
              Sem tag
            </button>
          )}
          <form className="class-board-tags-nova" onSubmit={criarEUsar} aria-label="Criar tag">
            <label className="class-board-tags-campo">
              <Tag className="size-3.5" aria-hidden="true" />
              <input
                value={nome}
                maxLength={24}
                placeholder="Nova tag…"
                aria-label="Nome da nova tag"
                autoFocus={tags.length === 0}
                onChange={(e) => { setNome(e.target.value); setErro(""); }}
              />
            </label>
            {/* As cores da tag são faixas com nome, iguais às do neon da campanha. */}
            <div role="radiogroup" aria-label="Cor da tag" className="class-board-neon-cores class-board-tags-cores">
              {CORES_TAG.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={cor === c.id}
                  aria-label={c.label}
                  title={c.label}
                  style={{ ["--neon" as string]: c.cor }}
                  onClick={() => setCor(c.id)}
                >
                  <span aria-hidden="true" />
                  {c.label}
                </button>
              ))}
            </div>
            <button type="submit" className="class-board-tags-criar">Criar e usar</button>
            {(erro || notice) && <p role="alert" className="class-board-tags-erro">{erro || notice}</p>}
          </form>
          {extra?.(fechar)}
        </PainelFlutuante>
      )}
    </div>
  );
}
