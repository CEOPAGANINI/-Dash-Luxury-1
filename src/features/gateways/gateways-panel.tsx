"use client";

import * as React from "react";
import { CheckCircle2, CircleDollarSign, Database, RefreshCw } from "lucide-react";

import { formatCurrency, formatInteger } from "@/features/unified-dashboard/formatters";
import { useTaxas } from "@/features/ads/fees-store";

import {
  GATEWAYS_DE_TABELA,
  ROTULO_DO_METODO,
  TICKET_DE_REFERENCIA_CENTS,
  gatewayDeTabela,
  percentualDaLinha,
  percentualDeTabela,
  type MetodoDePagamento,
} from "./gateway-fees";
import { useGatewayChoice } from "./gateway-choice-store";
import type { PanoramaDosGateways } from "./queries";

/*
  A sessão dos gateways: quem está conectado, quanto o gateway cobrou de
  verdade e qual taxa o painel está a usar no cálculo do lucro.

  A taxa nunca é digitada aqui. Ou vem do extrato (a soma das taxas dos
  pagamentos aprovados dividida pelo bruto), ou vem da tabela pública do
  gateway escolhido — e a tela diz sempre qual das duas.
*/

const porcento = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const dinheiro = (cents: number) => formatCurrency(cents / 100, Math.abs(cents) < 10_000 ? 2 : 0);

export function GatewaysPanel({ panorama }: { panorama: PanoramaDosGateways }) {
  const { escolha, guardar, notice } = useGatewayChoice();
  const { gatewayPercentual, definirGateway } = useTaxas();
  const medido = panorama.taxa;
  const temExtrato = medido.pagamentos > 0 && medido.brutoCents > 0;
  const ticket = panorama.ticketCents > 0 ? panorama.ticketCents : TICKET_DE_REFERENCIA_CENTS;
  const daTabela = escolha.gateway ? gatewayDeTabela(escolha.gateway) : null;
  /* A taxa que o painel deve usar: o extrato manda; sem extrato, a
     tabela do gateway escolhido; com "manual", o que o usuário pôs. */
  const automatica = temExtrato ? medido.percentual : daTabela ? percentualDeTabela(daTabela, ticket) : null;
  const origem: "extrato" | "tabela" | "manual" | "nenhuma" =
    escolha.origem === "manual" ? "manual" : temExtrato ? "extrato" : daTabela ? "tabela" : "nenhuma";

  /* Aplica a taxa automática sozinha: é este o pedido — não ter de
     digitar a porcentagem. Só não mexe quando o usuário pediu manual. */
  React.useEffect(() => {
    if (escolha.origem === "manual" || automatica === null) return;
    if (Math.abs(automatica - gatewayPercentual) < 0.005) return;
    definirGateway(automatica);
  }, [automatica, escolha.origem, gatewayPercentual, definirGateway]);

  const explicacao =
    origem === "extrato"
      ? `Medida no extrato: ${dinheiro(medido.taxaCents)} de taxa em ${dinheiro(medido.brutoCents)} recebidos, nos últimos ${panorama.dias} dias.`
      : origem === "tabela"
        ? `Tabela pública da ${daTabela?.nome}, sobre um ticket de ${dinheiro(ticket)}${panorama.ticketCents > 0 ? " (o seu)" : " (referência)"}.`
        : origem === "manual"
          ? "Você assumiu o volante: a taxa está fixada à mão."
          : "Escolha o seu gateway abaixo e a taxa entra sozinha.";

  return (
    <div className="dash-gateways">
      {notice && <p role="status" className="dash-gateways-aviso">{notice}</p>}

      {/* O número que o painel está a usar, e de onde veio. */}
      <section className="dash-gateways-taxa" aria-label="Taxa do gateway em uso">
        <header>
          <CircleDollarSign aria-hidden="true" />
          <h2>Taxa em uso no cálculo do lucro</h2>
          <span className="dash-gateways-origem" data-origem={origem}>
            {origem === "extrato" ? "Do extrato" : origem === "tabela" ? "Da tabela" : origem === "manual" ? "À mão" : "Sem taxa"}
          </span>
        </header>
        <b className="dash-gateways-numero">{porcento(gatewayPercentual)}</b>
        <p className="dash-gateways-explicacao">{explicacao}</p>
        <div className="dash-gateways-acoes">
          {escolha.origem === "manual" ? (
            <button type="button" onClick={() => guardar({ origem: temExtrato ? "extrato" : "tabela" })}>
              <RefreshCw aria-hidden="true" />
              Voltar à taxa automática
            </button>
          ) : (
            <button type="button" onClick={() => guardar({ origem: "manual" })}>
              Fixar esta taxa à mão
            </button>
          )}
          {escolha.origem === "manual" && (
            <label className="dash-gateways-manual">
              <span>Taxa (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={gatewayPercentual}
                aria-label="Taxa do gateway em porcentagem"
                onChange={(e) => definirGateway(Number(e.target.value))}
              />
            </label>
          )}
        </div>
      </section>

      {/* O que o gateway cobrou por forma de pagamento. */}
      <section className="dash-gateways-medido" aria-label="O que o gateway cobrou">
        <header>
          <Database aria-hidden="true" />
          <h2>O que o gateway cobrou · últimos {panorama.dias} dias</h2>
        </header>
        {!panorama.bancoConfigurado ? (
          <p className="dash-gateways-vazio">
            Sem banco ligado, não há extrato para medir. Assim que o banco e o gateway estiverem conectados, a taxa
            passa a sair daqui — da soma real das taxas dos pagamentos aprovados.
          </p>
        ) : !temExtrato ? (
          <p className="dash-gateways-vazio">
            Ainda não há pagamentos aprovados neste período. A taxa da tabela vale até o primeiro pagamento entrar.
          </p>
        ) : (
          <dl className="dash-gateways-linhas">
            {medido.porMetodo.map((l) => (
              <div key={l.metodo} data-metodo={l.metodo}>
                <dt>{ROTULO_DO_METODO[l.metodo as MetodoDePagamento]}</dt>
                <dd>{porcento(l.percentual)}</dd>
                <small>
                  {formatInteger(l.pagamentos)} {l.pagamentos === 1 ? "pagamento" : "pagamentos"} · {dinheiro(l.taxaCents)} de{" "}
                  {dinheiro(l.brutoCents)}
                </small>
              </div>
            ))}
            <div data-metodo="total">
              <dt>Total</dt>
              <dd>{porcento(medido.percentual)}</dd>
              <small>
                {formatInteger(medido.pagamentos)} pagamentos · {dinheiro(medido.taxaCents)} de {dinheiro(medido.brutoCents)}
              </small>
            </div>
          </dl>
        )}
      </section>

      {/* As contas de gateway ligadas ao painel. */}
      <section className="dash-gateways-contas" aria-label="Gateways conectados">
        <header>
          <h2>Gateways conectados</h2>
          <span>{panorama.contas.length} {panorama.contas.length === 1 ? "conta" : "contas"}</span>
        </header>
        {panorama.contas.length === 0 ? (
          <p className="dash-gateways-vazio">
            Nenhuma conta de gateway ligada ainda. Ligue uma em Integrações e o extrato começa a chegar por webhook.
          </p>
        ) : (
          <ul>
            {panorama.contas.map((c) => (
              <li key={c.id} data-ativa={c.ativa ? "true" : undefined}>
                <b>{c.provedor}</b>
                <span>{c.rotulo}</span>
                <span className="dash-gateways-selo" data-ambiente={c.ambiente}>{c.ambiente === "production" ? "Produção" : "Testes"}</span>
                {c.padrao && <span className="dash-gateways-selo">Padrão</span>}
                <span className="dash-gateways-selo" data-ok={c.ultimoTesteOk === true ? "true" : c.ultimoTesteOk === false ? "false" : undefined}>
                  {c.ultimoTesteOk === true ? "Conexão ok" : c.ultimoTesteOk === false ? "Conexão falhou" : "Sem teste"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* A tabela pública, para escolher o gateway sem digitar nada. */}
      <section className="dash-gateways-tabela" aria-label="Escolher o gateway">
        <header>
          <h2>Escolha o seu gateway</h2>
          <span>A taxa entra sozinha — você não digita porcentagem</span>
        </header>
        <ul>
          {GATEWAYS_DE_TABELA.map((g) => {
            const escolhido = escolha.gateway === g.id;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  aria-pressed={escolhido}
                  data-escolhido={escolhido ? "true" : undefined}
                  onClick={() => guardar({ gateway: escolhido ? null : g.id, origem: temExtrato ? "extrato" : "tabela" })}
                >
                  <span className="dash-gateways-nome">
                    {escolhido && <CheckCircle2 aria-hidden="true" />}
                    {g.nome}
                  </span>
                  <span className="dash-gateways-categoria">{g.categoria}</span>
                  <span className="dash-gateways-media">{porcento(percentualDeTabela(g, ticket))}</span>
                  <span className="dash-gateways-metodos">
                    {g.tabela.map((l) => (
                      <i key={l.metodo}>
                        {ROTULO_DO_METODO[l.metodo]} {porcento(percentualDaLinha(l, ticket))}
                      </i>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="dash-gateways-rodape">
          Estes são os preços de balcão que cada empresa publica — quem negociou paga menos. Servem de ponto de partida:
          quando houver extrato, o número medido toma o lugar deles sozinho.
        </p>
      </section>
    </div>
  );
}
