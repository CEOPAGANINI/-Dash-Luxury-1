"use client";

import * as React from "react";
import Link from "next/link";
import {
  Cable,
  CircleDollarSign,
  FileClock,
  Link2,
  Megaphone,
  Package,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GUARDRAILS_PADRAO,
  avaliarGuardrails,
  type ProfitGuardrails,
  type Veredito,
} from "@/features/guardrails/rules";
import { VereditoBadge } from "@/features/guardrails/veredito-badge";
import { unifiedDemoData } from "@/features/unified-dashboard/demo-data";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { useUnifiedDashboard } from "@/features/unified-dashboard/operation-provider";
import {
  SimpleStatusBadge,
  UnifiedMetricCard,
  UnifiedPageHeader,
  UnifiedSection,
} from "@/features/unified-dashboard/shared";
import type { NetworkId } from "@/features/unified-dashboard/types";
import { cn } from "@/lib/utils";

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b px-3 py-3 font-extrabold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length}
                className="text-muted-foreground border-b px-3 py-8 text-center"
              >
                Nenhum dado disponível.
              </td>
            </tr>
          )}
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-muted/20">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b px-3 py-3 last:border-b-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
  Campanhas.

  Três leituras, de cima para baixo: o placar do que está filtrado, a barra
  de gasto contra receita de cada campanha (onde o dinheiro entra e onde
  sai), e a tabela com a decisão do freio de mão por campanha — a mesma
  régua de Segurança, aplicada linha a linha.
*/
export function CampaignsDashboard({
  regras = GUARDRAILS_PADRAO,
}: {
  regras?: ProfitGuardrails;
}) {
  const { operation, networkId, setNetworkId } = useUnifiedDashboard();
  const campaigns =
    networkId === "all"
      ? operation.campaigns
      : operation.campaigns.filter((item) => item.network === networkId);

  const totais = campaigns.reduce(
    (acc, c) => ({
      gasto: acc.gasto + c.spend,
      receita: acc.receita + c.checkoutRevenue,
      lucro: acc.lucro + c.profit,
      compras: acc.compras + c.purchases,
    }),
    { gasto: 0, receita: 0, lucro: 0, compras: 0 },
  );
  const roasTotal = totais.gasto > 0 ? totais.receita / totais.gasto : 0;
  const margemTotal = totais.receita > 0 ? totais.lucro / totais.receita : 0;

  const decisoes = new Map(
    campaigns.map((c) => [
      c.id,
      avaliarGuardrails(
        {
          gasto: c.spend,
          receita: c.checkoutRevenue,
          lucro: c.profit,
          margem: c.checkoutRevenue > 0 ? c.profit / c.checkoutRevenue : 0,
          diasSeguidosNegativos: c.profit < 0 ? 1 : 0,
        },
        regras,
      ),
    ]),
  );
  const contagem = { escalar: 0, manter: 0, reduzir: 0, pausar: 0 };
  for (const d of decisoes.values()) contagem[d.veredito] += 1;

  const maiorValor = Math.max(
    1,
    ...campaigns.map((c) => Math.max(c.spend, c.checkoutRevenue)),
  );

  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Mídia e UTMs"
        title="Campanhas"
        description={`Campanhas da ${operation.name}, com a decisão do freio de mão em cada uma. A análise profunda permanece na página de Tráfego.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/seguranca">Regras do freio</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/trafego">Abrir Tráfego</Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all", name: "Todas" },
            ...operation.networks.map((item) => ({
              id: item.id,
              name: item.name,
            })),
          ] as { id: NetworkId; name: string }[]
        ).map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={networkId === item.id ? "default" : "outline"}
            onClick={() => setNetworkId(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UnifiedMetricCard
          label="Gasto em mídia"
          value={formatCompactCurrency(totais.gasto)}
          note={`${campaigns.length} ${campaigns.length === 1 ? "campanha" : "campanhas"} no filtro.`}
        />
        <UnifiedMetricCard
          label="Receita no checkout"
          value={formatCompactCurrency(totais.receita)}
          note={`${formatInteger(totais.compras)} compras atribuídas.`}
        />
        <UnifiedMetricCard
          label="ROAS"
          value={formatRatio(roasTotal)}
          note={`Mínimo ${formatRatio(regras.roasMinimo, 1)} · pausa abaixo de ${formatRatio(regras.roasPausa, 1)}.`}
          tone={
            roasTotal < regras.roasPausa
              ? "destructive"
              : roasTotal < regras.roasMinimo
                ? "warning"
                : "success"
          }
        />
        <UnifiedMetricCard
          label="Lucro de contribuição"
          value={formatCompactCurrency(totais.lucro)}
          note={`Margem de ${formatPercent(margemTotal)} sobre a receita.`}
          tone={
            totais.lucro < 0
              ? "destructive"
              : margemTotal < regras.margemMinima
                ? "warning"
                : "success"
          }
        />
      </div>

      <UnifiedSection
        eyebrow="Onde o dinheiro está"
        title="Gasto contra receita, por campanha"
        description="A barra clara é o gasto; a escura, a receita do checkout. Quando a clara passa a escura, a campanha está pagando para vender."
        icon={Megaphone}
        aside={
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(contagem) as Veredito[]).map((v) =>
              contagem[v] > 0 ? (
                <VereditoBadge key={v} veredito={v} className="gap-1">
                  {contagem[v]}
                </VereditoBadge>
              ) : null,
            )}
          </div>
        }
      >
        <ul className="space-y-3">
          {campaigns.map((campaign) => {
            const decisao = decisoes.get(campaign.id)!;
            return (
              <li key={campaign.id} className="grid gap-1.5 md:grid-cols-[minmax(0,14rem)_1fr_auto] md:items-center md:gap-4">
                <span className="min-w-0">
                  <b className="block truncate text-sm">{campaign.name}</b>
                  <small className="text-muted-foreground">
                    {operation.networks.find((n) => n.id === campaign.network)?.name ?? campaign.network}
                    {" · "}
                    {formatRatio(decisao.roas)}
                  </small>
                </span>
                <span className="grid gap-1" aria-hidden>
                  <span className="bg-muted/40 flex h-2 overflow-hidden rounded-full">
                    <span
                      className="bg-foreground/35 rounded-full"
                      style={{ width: `${(campaign.spend / maiorValor) * 100}%` }}
                    />
                  </span>
                  <span className="bg-muted/40 flex h-2 overflow-hidden rounded-full">
                    <span
                      className="bg-foreground rounded-full"
                      style={{ width: `${(campaign.checkoutRevenue / maiorValor) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="flex items-center gap-3 text-xs tabular-nums md:justify-end">
                  <span className="text-muted-foreground">
                    {formatCompactCurrency(campaign.spend)} →{" "}
                    <b className="text-foreground">
                      {formatCompactCurrency(campaign.checkoutRevenue)}
                    </b>
                  </span>
                  <VereditoBadge veredito={decisao.veredito} />
                </span>
              </li>
            );
          })}
        </ul>
      </UnifiedSection>

      <UnifiedSection
        eyebrow="Detalhe"
        title="Todas as campanhas"
        description="A decisão de cada linha vem das regras de Segurança; passe o mouse nela para ler o motivo."
        icon={ReceiptText}
      >
        <DataTable
          headers={[
            "Campanha",
            "Rede",
            "Objetivo",
            "Gasto",
            "Receita checkout",
            "ROAS",
            "CPA",
            "Lucro",
            "Freio de mão",
            "Estado",
          ]}
          rows={campaigns.map((campaign) => {
            const network = operation.networks.find(
              (item) => item.id === campaign.network,
            );
            const decisao = decisoes.get(campaign.id)!;
            return [
              <div key="name">
                <b className="block">{campaign.name}</b>
                <small className="text-muted-foreground">
                  ID {campaign.id}
                </small>
              </div>,
              network?.name ?? campaign.network,
              campaign.objective,
              <span key="spend" className="tabular-nums">
                {formatCompactCurrency(campaign.spend)}
              </span>,
              <span key="revenue" className="tabular-nums">
                {formatCompactCurrency(campaign.checkoutRevenue)}
              </span>,
              <span key="roas" className="tabular-nums">
                {formatRatio(campaign.checkoutRevenue / campaign.spend)}
              </span>,
              <span key="cpa" className="tabular-nums">
                {formatCurrency(campaign.spend / campaign.purchases)}
              </span>,
              <span
                key="profit"
                className={cn(
                  "font-bold tabular-nums",
                  campaign.profit >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {formatCompactCurrency(campaign.profit)}
              </span>,
              <span key="freio" title={decisao.motivo}>
                <VereditoBadge veredito={decisao.veredito} />
              </span>,
              <SimpleStatusBadge key="status" status={campaign.status} />,
            ];
          })}
        />
      </UnifiedSection>
    </div>
  );
}

export function FinanceOverviewDashboard() {
  const { operation } = useUnifiedDashboard();
  const kpis = operation.kpis;
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Financeiro"
        title="Visão financeira"
        description={`Caixa, receita, taxas e movimentações da ${operation.name}.`}
      />
      <UnifiedSection
        eyebrow="Resumo"
        title="Dinheiro da operação"
        description="Caixa disponível, valores pendentes, receita líquida e reembolsos."
        icon={Wallet}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UnifiedMetricCard
            label="Saldo disponível"
            value={formatCompactCurrency(kpis.cash * 0.74)}
            note="Pronto para repasse."
            delta="Sem histórico"
            tone="success"
          />
          <UnifiedMetricCard
            label="Saldo pendente"
            value={formatCompactCurrency(kpis.cash * 0.26)}
            note="Em processamento."
            delta="Sem histórico"
            tone="warning"
          />
          <UnifiedMetricCard
            label="Receita líquida"
            value={formatCompactCurrency(kpis.netRevenue)}
            note="Após devoluções e perdas."
            delta="Sem histórico"
            tone="info"
          />
          <UnifiedMetricCard
            label="Reembolsos"
            value={formatCompactCurrency(kpis.netRevenue * 0.018)}
            note="Sem movimentações."
            delta="Sem histórico"
            tone="destructive"
          />
        </div>
      </UnifiedSection>
      <UnifiedSection
        eyebrow="Movimentações"
        title="Fluxo de caixa"
        description="Entradas e saídas recentes."
        icon={ReceiptText}
      >
        <DataTable
          headers={["Data", "Descrição", "Categoria", "Tipo", "Valor"]}
          rows={unifiedDemoData.transactions.map((transaction) => [
            transaction.date,
            transaction.description,
            transaction.category,
            <Badge
              key="type"
              variant={
                transaction.type === "entrada" ? "success" : "destructive"
              }
            >
              {transaction.type}
            </Badge>,
            <b
              key="value"
              className={cn(
                "tabular-nums",
                transaction.type === "entrada"
                  ? "text-success"
                  : "text-destructive",
              )}
            >
              {transaction.type === "entrada" ? "+ " : "− "}
              {formatCurrency(transaction.value, 2)}
            </b>,
          ])}
        />
      </UnifiedSection>
    </div>
  );
}

export function ProcessorDashboard() {
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Gateway"
        title="Processador"
        description="Saúde da integração de pagamentos e webhooks."
      />
      <UnifiedSection
        eyebrow="Broski"
        title="MB WAY e Multibanco"
        description="Configure a conexão principal para receber dados reais."
        icon={CircleDollarSign}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UnifiedMetricCard
            label="Conexão"
            value="Inativa"
            note="Nenhum teste registrado."
            delta="Não configurada"
            tone="neutral"
          />
          <UnifiedMetricCard
            label="Taxa de aprovação"
            value="0%"
            note="Pagamentos aprovados."
            delta="Sem dados"
            tone="info"
          />
          <UnifiedMetricCard
            label="Tempo médio"
            value="0s"
            note="Até a confirmação."
            delta="Sem dados"
            tone="neutral"
          />
          <UnifiedMetricCard
            label="Webhooks"
            value="0%"
            note="Eventos processados."
            delta="Sem dados"
            tone="neutral"
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ["Ambiente", "Não configurado"],
            ["Merchant ID", "—"],
            ["Webhook", "—"],
            ["Moeda", "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-muted/20 p-4">
              <span className="text-muted-foreground text-xs">{label}</span>
              <b className="mt-2 block break-all text-sm">{value}</b>
            </div>
          ))}
        </div>
      </UnifiedSection>
    </div>
  );
}

export function PayoutsDashboard() {
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Financeiro"
        title="Repasses"
        description="Valores disponíveis, pendentes e pagos."
      />
      <UnifiedSection
        eyebrow="Próximos repasses"
        title="Previsão"
        description="Valores do próximo ciclo quando houver movimentações."
        icon={Wallet}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <UnifiedMetricCard
            label="Disponível"
            value={formatCompactCurrency(0)}
            note="Pode ser solicitado."
            delta="Sem dados"
            tone="success"
          />
          <UnifiedMetricCard
            label="Pendente"
            value={formatCompactCurrency(0)}
            note="Em processamento."
            delta="Sem dados"
            tone="warning"
          />
          <UnifiedMetricCard
            label="Próximo repasse"
            value={formatCompactCurrency(0)}
            note="Sem data prevista."
            delta="Sem dados"
            tone="info"
          />
        </div>
      </UnifiedSection>
      <UnifiedSection
        eyebrow="Histórico"
        title="Últimos pagamentos"
        description="Repasses anteriores."
        icon={ReceiptText}
      >
        <DataTable headers={["Data", "Gateway", "Valor", "Estado"]} rows={[]} />
      </UnifiedSection>
    </div>
  );
}

export function PaymentLinksDashboard() {
  const rows: readonly (readonly [
    string,
    string,
    number,
    number,
    number,
    number,
    string,
  ])[] = [];
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Cobrança"
        title="Links de pagamento"
        description="Links rastreáveis com produto, preço, validade e conversão."
        actions={
          <Button>
            <Link2 /> Criar link
          </Button>
        }
      />
      <UnifiedSection
        eyebrow="Links"
        title="Links ativos"
        description="Conversão e receita por link."
        icon={Link2}
      >
        <DataTable
          headers={[
            "Link",
            "Produto",
            "Preço",
            "Cliques",
            "Vendas",
            "Receita",
            "Estado",
          ]}
          rows={rows.map((row) => [
            <code key="link" className="text-xs">
              {row[0]}
            </code>,
            row[1],
            formatCurrency(row[2], 2),
            formatInteger(row[3]),
            formatInteger(row[4]),
            formatCompactCurrency(row[5]),
            <SimpleStatusBadge key="status" status={row[6]} />,
          ])}
        />
      </UnifiedSection>
    </div>
  );
}

export function ProductsDashboard() {
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Catálogo"
        title="Produtos"
        description="Produtos físicos, digitais e serviços."
        actions={
          <Button>
            <Package /> Novo produto
          </Button>
        }
      />
      <UnifiedSection
        eyebrow="Catálogo"
        title="Preço, estoque e publicação"
        description="Catálogo pronto para receber produtos reais."
        icon={Package}
      >
        <DataTable
          headers={["Produto", "Tipo", "Preço", "Estoque", "Estado"]}
          rows={unifiedDemoData.products.map((product) => [
            <b key="name">{product.name}</b>,
            product.type,
            formatCurrency(product.price, 2),
            product.stock,
            <SimpleStatusBadge key="status" status={product.status} />,
          ])}
        />
      </UnifiedSection>
    </div>
  );
}

export function IntegrationsDashboard() {
  const items = [
    ["Broski", "Pagamentos", "Não configurada"],
    ["Meta Pixel", "Pixels", "Não configurada"],
    ["Google Ads", "Mídia", "Não configurada"],
    ["Resend", "Email", "Não configurada"],
    ["Pushcut", "Automação", "Não configurada"],
    ["Supabase", "Banco", "Não configurada"],
  ];
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Sistema"
        title="Integrações"
        description="Serviços externos, status e configuração."
      />
      <UnifiedSection
        eyebrow="Central"
        title="Integrações conectadas"
        description="Teste e configure cada conexão."
        icon={Cable}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(([name, category, status]) => (
            <article key={name} className="rounded-2xl border bg-muted/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <b>{name}</b>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {category}
                  </p>
                </div>
                <SimpleStatusBadge status={status} />
              </div>
              <Button variant="outline" size="sm" className="mt-4">
                Configurar
              </Button>
            </article>
          ))}
        </div>
      </UnifiedSection>
    </div>
  );
}

export function LogsDashboard() {
  const rows: string[][] = [];
  return (
    <div className="space-y-6">
      <UnifiedPageHeader
        eyebrow="Auditoria"
        title="Logs"
        description="Eventos, webhooks, integrações e falhas."
      />
      <UnifiedSection
        eyebrow="Eventos"
        title="Atividade recente"
        description="Eventos reais aparecerão após a conexão das integrações."
        icon={FileClock}
      >
        <DataTable
          headers={["Hora", "Tipo", "Origem", "Mensagem", "Estado"]}
          rows={rows.map((row) => [
            row[0],
            <code key="type" className="text-xs">
              {row[1]}
            </code>,
            row[2],
            row[3],
            <SimpleStatusBadge key="status" status={row[4]} />,
          ])}
        />
      </UnifiedSection>
    </div>
  );
}
