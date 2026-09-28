"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { FunnelBoard } from "./funnel-board";
import { FUNIL_DEMO } from "./funnel-demo";
import type { FunnelData, FunnelNodeType } from "./funnel-model";

const STORAGE_KEY = "funnel-board:demo";

/**
 * Casca client do quadro: liga o board ao roteador e guarda o funil no
 * navegador, para o "Salvar" ter efeito sem um backend. Enquanto não há
 * persistência de servidor, esta é a fonte da verdade do quadro de exemplo.
 */
export function FunnelBoardClient({
  inicial,
  focoTipo,
}: {
  inicial?: FunnelData;
  /** Abre, ao montar, o primeiro bloco deste tipo (ex.: "redirect"). */
  focoTipo?: FunnelNodeType;
}) {
  const router = useRouter();
  const [pronto, setPronto] = React.useState(false);
  const [dados, setDados] = React.useState<FunnelData>(inicial ?? FUNIL_DEMO);
  // Nonce de remontagem: garante que um "reset" para um funil de mesmo id
  // (ex.: Excluir → volta ao demo) recrie o board em vez de manter o state.
  const [resetSeq, setResetSeq] = React.useState(0);

  // Lê o funil salvo depois de montar, evitando divergência de hidratação.
  React.useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- o rascunho só existe no navegador
      if (bruto) setDados(JSON.parse(bruto) as FunnelData);
    } catch {
      /* localStorage indisponível — segue com o exemplo. */
    }
    setPronto(true);
  }, []);

  const salvar = React.useCallback((data: FunnelData) => {
    setDados(data);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* sem persistência local; o estado em memória continua valendo. */
    }
  }, []);

  if (!pronto) {
    return <div className="funnel" aria-busy="true" />;
  }

  return (
    <FunnelBoard
      key={`${dados.id}:${resetSeq}`}
      inicial={dados}
      focoTipo={focoTipo}
      onVoltar={() => router.push("/campanhas")}
      onSalvar={salvar}
      onAbrir={(data) => {
        salvar(data);
        setResetSeq((n) => n + 1);
      }}
      onArquivar={() => router.push("/campanhas")}
      onExcluir={() => {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* nada a limpar. */
        }
        setDados(FUNIL_DEMO);
        setResetSeq((n) => n + 1);
      }}
    />
  );
}
