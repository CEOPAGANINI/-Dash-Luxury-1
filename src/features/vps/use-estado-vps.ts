"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ErroDoPainel,
  lerEstado,
  temAlgoAndando,
  type EstadoDaTela,
} from "./vps-cliente";

/*
  O estado vivo das telas do Servidor. Não há conexão aberta com a VPS nem
  com o painel: a tela pergunta de tempos em tempos (GET
  /api/painel/vps/estado) e o agente pulsa por conta própria.

  - 5 s enquanto há algo andando (tarefa na fila, agente esperando
    instalação ou confirmação, HTTPS sendo pedido), 15 s no resto;
  - aba oculta não pergunta nada; ao voltar, pergunta na hora;
  - falha (rede, 5xx, resposta que não é JSON) NÃO apaga o que já estava
    na tela: os dados ficam e a tela avisa, com a hora da última
    atualização, que vai tentar de novo;
  - sessão vencida (401 ou redirect para o login) para o polling: não
    adianta insistir sem login.

  O setState acontece só na volta do pedido (dentro do .then), nunca no
  corpo do efeito.
*/

export const INTERVALO_RAPIDO_MS = 5_000;
export const INTERVALO_LENTO_MS = 15_000;

export type FalhaDeAtualizacao = {
  tipo: "sessao" | "falha";
  /** ISO da última atualização que deu certo. */
  ultimaEm: string;
  /** O motivo, quando o painel recusou com uma frase (ex.: sem permissão). */
  detalhe: string | null;
};

export function useEstadoVps(
  inicial: EstadoDaTela,
  filtro: { servidorId?: string; siteId?: string } = {},
): {
  estado: EstadoDaTela;
  falha: FalhaDeAtualizacao | null;
  /** Pergunta agora (depois de uma ação, para a tela não esperar 15 s). */
  atualizar: () => void;
} {
  const [estado, setEstado] = useState(inicial);
  const [falha, setFalha] = useState<FalhaDeAtualizacao | null>(null);
  const [pedidos, setPedidos] = useState(0);
  const intervalo = useRef(
    temAlgoAndando(inicial) ? INTERVALO_RAPIDO_MS : INTERVALO_LENTO_MS,
  );
  const ultimaEm = useRef(inicial.agora);
  const { servidorId, siteId } = filtro;

  useEffect(() => {
    let vivo = true;
    let sessaoVencida = false;
    let relogio: ReturnType<typeof setTimeout> | undefined;

    function agendar(ms: number) {
      clearTimeout(relogio);
      if (!vivo || sessaoVencida || document.hidden) return;
      relogio = setTimeout(buscar, ms);
    }

    function buscar() {
      if (!vivo || document.hidden) return;
      lerEstado({ servidorId, siteId }).then(
        (novo) => {
          if (!vivo) return;
          ultimaEm.current = novo.agora;
          intervalo.current = temAlgoAndando(novo)
            ? INTERVALO_RAPIDO_MS
            : INTERVALO_LENTO_MS;
          setEstado(novo);
          setFalha(null);
          agendar(intervalo.current);
        },
        (erro: unknown) => {
          if (!vivo) return;
          sessaoVencida =
            erro instanceof ErroDoPainel && erro.tipo === "sessao";
          setFalha({
            tipo: sessaoVencida ? "sessao" : "falha",
            ultimaEm: ultimaEm.current,
            detalhe:
              erro instanceof ErroDoPainel && erro.tipo === "recusado"
                ? erro.message
                : null,
          });
          agendar(INTERVALO_LENTO_MS);
        },
      );
    }

    function aoMudarVisibilidade() {
      if (document.hidden) clearTimeout(relogio);
      else agendar(0);
    }

    // Na montagem os dados vieram prontos da página; depois de uma ação
    // (pedidos > 0) a pergunta é imediata.
    agendar(pedidos > 0 ? 0 : intervalo.current);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      vivo = false;
      clearTimeout(relogio);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [servidorId, siteId, pedidos]);

  const atualizar = useCallback(() => setPedidos((n) => n + 1), []);

  return { estado, falha, atualizar };
}
