"use client";

import * as React from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Calculator, Columns3, LayoutGrid, Megaphone, Search, Table2, Video } from "lucide-react";

import { PageSessionMenu, type PastaLateral } from "@/components/dashboard/page-session-menu";
import { BlockPicker } from "@/components/ui/block-picker";
import { NETWORK_MANAGERS } from "./manager-model";
import { SESSOES_DA_REDE, type SessaoDaRedeId } from "./network-sessions-model";
import type { AdNetwork } from "./types";

/* Os ícones das redes e das páginas da rede (os mesmos do menu da esquerda). */
const ICONE_DA_REDE: Record<AdNetwork, React.ReactNode> = { meta: <Megaphone />, google: <Search />, youtube: <Video /> };
const ICONE_DA_SESSAO: Record<SessaoDaRedeId, React.ReactNode> = {
  classes: <LayoutGrid />,
  tabela: <Table2 />,
  gerenciador: <Columns3 />,
  metricas: <BarChart3 />,
  calculadora: <Calculator />,
};

/**
 * Navegação da rede de tráfego, toda no menu recolhível da borda direita,
 * que funciona como o menu da esquerda: as redes são pastas (Meta, Google,
 * YouTube e o quadro de todas); abrir uma pasta mostra só as páginas dela.
 * No celular vira uma fila de blocos. Cada escolha abre um endereço
 * próprio; o `?modo=real` vai junto.
 */
export function NetworkSessionNav({
  rede,
  sessao,
  title,
  ariaLabel,
}: {
  rede: AdNetwork;
  sessao: SessaoDaRedeId;
  title: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  const busca = useSearchParams();
  const q = busca.toString();
  const sufixo = q ? `?${q}` : "";
  const ativa = SESSOES_DA_REDE.findIndex((s) => s.id === sessao);

  function abrir(id: SessaoDaRedeId) {
    router.push(`/campanhas/${rede}/${id}${sufixo}`);
  }

  /* Cada rede é uma pasta com as cinco páginas dela; "Todas as redes" é
     uma pasta com o quadro geral. */
  const pastas: PastaLateral[] = (Object.keys(NETWORK_MANAGERS) as AdNetwork[]).map((n) => ({
    id: n,
    label: NETWORK_MANAGERS[n].label,
    legenda: NETWORK_MANAGERS[n].description,
    icon: ICONE_DA_REDE[n],
    atual: n === rede,
    paginas: SESSOES_DA_REDE.map((s) => ({
      label: s.label,
      short: s.short,
      href: `/campanhas/${n}/${s.id}${sufixo}`,
      active: n === rede && s.id === sessao,
      icon: ICONE_DA_SESSAO[s.id],
    })),
  }));
  pastas.push({
    id: "quadro",
    label: "Todas as redes",
    legenda: "Quadro geral com as três redes",
    icon: <Megaphone />,
    paginas: [{ label: "Quadro geral com as três redes", short: "Quadro geral", href: `/campanhas/quadro${sufixo}`, icon: <LayoutGrid /> }],
  });

  return (
    <>
      <div className="board-pager-mobile-nav">
        <span>Rede</span>
        <BlockPicker
          ariaLabel="Rede de tráfego"
          size="sm"
          stretch
          value={rede}
          onChange={(v) => router.push(v === "quadro" ? `/campanhas/quadro${sufixo}` : `/campanhas/${v}/${sessao}${sufixo}`)}
          options={[
            ...(Object.keys(NETWORK_MANAGERS) as AdNetwork[]).map((n) => ({ value: n, label: NETWORK_MANAGERS[n].label })),
            { value: "quadro", label: "Todas as redes" },
          ]}
        />
        <span>Página da rede</span>
        <BlockPicker
          ariaLabel={ariaLabel}
          size="sm"
          stretch
          value={sessao}
          onChange={(v) => abrir(v as SessaoDaRedeId)}
          options={SESSOES_DA_REDE.map((s, index) => ({
            value: s.id,
            label: `${String(index + 1).padStart(2, "0")} · ${s.short}`,
          }))}
        />
      </div>
      <PageSessionMenu
        items={SESSOES_DA_REDE}
        activeIndex={ativa}
        onSelect={(index) => abrir(SESSOES_DA_REDE[index].id)}
        ariaLabel={ariaLabel}
        title={title}
        pastas={pastas}
        rotuloDasPastas="Redes de tráfego"
      />
    </>
  );
}
