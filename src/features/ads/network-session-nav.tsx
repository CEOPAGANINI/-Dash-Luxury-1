"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { PageSessionMenu } from "@/components/dashboard/page-session-menu";
import { BlockPicker } from "@/components/ui/block-picker";
import { NETWORK_MANAGERS } from "./manager-model";
import { SESSOES_DA_REDE, type SessaoDaRedeId } from "./network-sessions-model";
import type { AdNetwork } from "./types";

/**
 * Navegação da rede de tráfego, toda no menu recolhível da borda direita:
 * primeiro as redes (Meta, Google, YouTube e o quadro de todas), depois as
 * páginas desta rede. No celular vira uma fila de blocos. Cada escolha
 * abre um endereço próprio; o `?modo=real` vai junto.
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

  const redes = (Object.keys(NETWORK_MANAGERS) as AdNetwork[]).map((n) => ({
    href: `/campanhas/${n}/${sessao}${sufixo}`,
    short: NETWORK_MANAGERS[n].label,
    label: NETWORK_MANAGERS[n].description,
    active: n === rede,
  }));
  redes.push({
    href: `/campanhas/quadro${sufixo}`,
    short: "Todas as redes",
    label: "Quadro geral com as três redes",
    active: false,
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
        groups={[{ title: "Rede de tráfego", items: redes }]}
        sectionTitle="Páginas desta rede"
      />
    </>
  );
}
