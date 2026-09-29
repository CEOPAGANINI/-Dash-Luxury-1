"use client";

/*
  O painel lateral de qualquer bloco que não é página nem Redirecionador
  (anúncio, automação, CRM, link…). Mesma casca do publicador da página:
  abas Geral (nome, referência, observação), Ligações (de onde vem e para
  onde vai) e Sobre (o que este bloco faz). Só interface (Fase 1).
*/

import * as React from "react";
import { ArrowRightLeft, Info, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  ROTULO_TIPO,
  RECURSO_POR_TIPO,
  type FunnelEdge,
  type FunnelNode,
  type FunnelNodeType,
} from "./funnel-model";

type Aba = "geral" | "ligacoes" | "sobre";

const ABAS: {
  id: Aba;
  rotulo: string;
  sub: string;
  cor: string;
  Icone: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: "geral", rotulo: "Geral", sub: "Nome, referência e observação", cor: "#60a5fa", Icone: SlidersHorizontal },
  { id: "ligacoes", rotulo: "Ligações", sub: "De onde vem e para onde vai", cor: "#00e559", Icone: ArrowRightLeft },
  { id: "sobre", rotulo: "Sobre", sub: "O que este bloco faz no funil", cor: "#a78bfa", Icone: Info },
];

/** O que cada bloco faz, explicado como para uma criança de 10 anos. */
const SOBRE: Partial<Record<FunnelNodeType, { faz: string; dica: string }>> = {
  ad: { faz: "É o anúncio que chama as pessoas: o cartaz na porta da loja. Dele saem as visitas para a primeira página.", dica: "Ligue o anúncio à página que ele promete. Um anúncio, uma promessa, uma página." },
  campaign: { faz: "Manda e-mails sozinho, um atrás do outro, para quem entrou. É o carteiro automático.", dica: "Use depois da captura: boas-vindas, lembrete, oferta, último aviso." },
  group_campaign: { faz: "Como a automação de e-mail, mas para grupos (WhatsApp, Telegram): avisa todo mundo de uma vez.", dica: "Bom para lançamentos com dia e hora marcados." },
  lead_list: { faz: "A lista de quem deixou o contato. É o caderno com os nomes.", dica: "Ligue a captura aqui e a automação sai desta lista." },
  pipeline: { faz: "O CRM: acompanha cada venda, do primeiro contato até o pagamento.", dica: "Ligue o checkout aqui para ver quem comprou e quem parou no meio." },
  pipeline_ticket: { faz: "O suporte: cada pedido de ajuda vira um ticket com dono e prazo.", dica: "Ligue a página de obrigado ou a área de membros aqui." },
  pipeline_attendance: { faz: "Atendimento por chat/WhatsApp com fila e horário.", dica: "Ligue o link do WhatsApp aqui para o atendimento nascer já organizado." },
  agents: { faz: "Um agente de IA que responde, qualifica e encaminha sozinho.", dica: "Coloque antes do atendimento humano: ele filtra e o time só pega o que importa." },
  device: { faz: "Separa o fluxo por aparelho (celular, computador, tablet).", dica: "Prefira o Redirecionador: ele faz isso e também por região, rede e origem." },
  webhooks: { faz: "Avisa outro sistema quando algo acontece (venda, cadastro).", dica: "Ligue o checkout aqui para mandar a venda para a planilha ou o ERP." },
  internal_doc: { faz: "Um documento da empresa preso ao funil: roteiro, checklist, briefing.", dica: "Deixe perto do bloco a que ele se refere." },
  comment: { faz: "Um recado no quadro para você ou para o time.", dica: "Use para lembrar decisões: por que este passo existe." },
  report: { faz: "Um relatório com os números do trecho do funil que ele está ligado.", dica: "Ligue as páginas que quer comparar." },
  shortcut_url: { faz: "Um link curto que manda para um endereço.", dica: "Útil em bio de rede social e QR code." },
  link_test_ab: { faz: "Divide as visitas entre duas versões para ver qual vende mais.", dica: "Teste uma coisa por vez: título, preço ou imagem." },
  link_split: { faz: "Divide o tráfego em partes (ex.: 70% / 30%).", dica: "Para dividir por região ou aparelho, use o Redirecionador." },
  link_countries: { faz: "Manda cada país para uma página diferente.", dica: "O Redirecionador faz isso com mais opções." },
  link_whats: { faz: "Um link que abre o WhatsApp já com a mensagem pronta.", dica: "Ligue ao atendimento para a conversa cair na fila certa." },
};

export function BlockPanel({
  node,
  nodes,
  edges,
  onChange,
  onFechar,
  onRemover,
  onIrPara,
}: {
  node: FunnelNode;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  onChange: (patch: Partial<FunnelNode>) => void;
  onFechar: () => void;
  onRemover: () => void;
  onIrPara?: (nodeId: string) => void;
}) {
  const [aba, setAba] = React.useState<Aba>("geral");
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const nome = (id: string) => nodes.find((n) => n.id === id);
  const entradas = edges.filter((e) => e.target === node.id).map((e) => nome(e.source)).filter(Boolean) as FunnelNode[];
  const saidas = edges.filter((e) => e.source === node.id).map((e) => nome(e.target)).filter(Boolean) as FunnelNode[];
  const sobre = SOBRE[node.type];
  const def = RECURSO_POR_TIPO[node.type];
  const tipo = ROTULO_TIPO[node.type];

  return (
    <aside
      className="pub pub--bloco"
      aria-label={`Configurar ${tipo}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="pub__head">
        <div className="pub__head-id">
          <span className="pub__badge">{tipo}</span>
          <input
            className="pub__nome"
            value={node.title}
            aria-label="Nome do bloco"
            maxLength={120}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <button type="button" className="pub__x" aria-label="Fechar" onClick={onFechar}>
          ✕
        </button>
      </header>
      <div className="pub__url">
        {entradas.length} {entradas.length === 1 ? "entrada" : "entradas"} · {saidas.length}{" "}
        {saidas.length === 1 ? "saída" : "saídas"}
        {node.url ? ` · ${node.url}` : ""}
      </div>

      <div className="pub__body">
        <nav className="pub__rail" aria-label="Abas do bloco">
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
          <div className="pub__sec" style={{ "--aba-cor": abaAtual.cor } as React.CSSProperties}>
            <span className="pub__sec-badge" aria-hidden>
              <abaAtual.Icone size={18} strokeWidth={2} />
            </span>
            <span className="pub__sec-txt">
              <b className="pub__sec-titulo">{abaAtual.rotulo}</b>
              <span className="pub__sec-sub">{abaAtual.sub}</span>
            </span>
          </div>

          {aba === "geral" && (
            <>
              <label className="pub__campo">
                <span>Nome</span>
                <input
                  className="pub__input"
                  value={node.title}
                  maxLength={120}
                  onChange={(e) => onChange({ title: e.target.value })}
                />
              </label>
              <label className="pub__campo">
                <span>Referência</span>
                <input
                  className="pub__input"
                  value={node.url ?? ""}
                  maxLength={2048}
                  placeholder="ex.: lista-vip, campanha-quente, https://…"
                  onChange={(e) => onChange({ url: e.target.value })}
                />
                <small className="pub__hint">
                  Um apelido, id ou endereço para você achar este bloco depois. Não liga nada de verdade.
                </small>
              </label>
              <label className="pub__campo">
                <span>Observação</span>
                <textarea
                  className="pub__input"
                  rows={4}
                  value={node.descricao ?? ""}
                  maxLength={2000}
                  placeholder="Por que este passo existe, o que precisa lembrar…"
                  onChange={(e) => onChange({ descricao: e.target.value })}
                />
              </label>
            </>
          )}

          {aba === "ligacoes" && (
            <>
              <div className="pub__campo">
                <span>Vem de ({entradas.length})</span>
                {entradas.length === 0 && (
                  <small className="pub__hint">Nada chega aqui ainda. Puxe uma linha de outro bloco até este.</small>
                )}
                {entradas.map((n) => (
                  <Ligacao key={n.id} n={n} lado="←" onIrPara={onIrPara} />
                ))}
              </div>
              <div className="pub__campo">
                <span>Vai para ({saidas.length})</span>
                {saidas.length === 0 && (
                  <small className="pub__hint">Nenhuma saída. Puxe da bolinha ▸ deste bloco até o próximo, ou solte no vazio para criar.</small>
                )}
                {saidas.map((n) => (
                  <Ligacao key={n.id} n={n} lado="→" onIrPara={onIrPara} />
                ))}
              </div>
            </>
          )}

          {aba === "sobre" && (
            <>
              <div className="pub__campo blk__sobre">
                <span>{def?.label ?? tipo}</span>
                <p>{sobre?.faz ?? "Um bloco do funil. Ligue-o ao passo anterior e ao próximo para o fluxo fazer sentido."}</p>
              </div>
              {sobre?.dica && (
                <div className="pub__campo blk__dica">
                  <span>Dica</span>
                  <p>{sobre.dica}</p>
                </div>
              )}
              <small className="pub__hint">
                Configurações específicas deste tipo de bloco (contas, modelos, gatilhos) chegam na Fase 2, junto com a VPS.
              </small>
            </>
          )}
        </div>
      </div>

      <footer className="pub__foot">
        <span className="pub__foot-vps">
          <span className="pub__vps-dot" aria-hidden />
          Só interface — nada roda de verdade na Fase 1
        </span>
        <button type="button" className="pub__btn blk__remover" onClick={onRemover}>
          <Trash2 size={14} strokeWidth={2} /> Remover bloco
        </button>
      </footer>
    </aside>
  );
}

function Ligacao({ n, lado, onIrPara }: { n: FunnelNode; lado: string; onIrPara?: (id: string) => void }) {
  return (
    <div className="blk__lig">
      <span className="blk__lig-lado" aria-hidden>{lado}</span>
      <span className="blk__lig-nome">
        {n.title || "(sem nome)"} <small>{ROTULO_TIPO[n.type]}</small>
      </span>
      {onIrPara && (
        <button type="button" className="blk__lig-ver" onClick={() => onIrPara(n.id)}>
          Ver no quadro ↗
        </button>
      )}
    </div>
  );
}
