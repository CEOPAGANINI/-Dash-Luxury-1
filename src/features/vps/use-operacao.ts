"use client";

import { useEffect, useRef, useState } from "react";

import type { CodigoVps, ResultadoVps } from "./modelo";
import { ErroDoPainel } from "./vps-cliente";

/*
  Uma operação da tela (uma server action ou o envio do ZIP), com o padrão
  run() do painel VPS anterior:

  - `travado` (ref, não estado) barra o segundo clique ANTES do React
    redesenhar: com estado, dois cliques rápidos passavam os dois;
  - `montado` evita setState depois que a tela saiu (a action pode
    responder depois de uma navegação);
  - o que está andando vai para `ocupado` (role="status"), o que deu certo
    para `aviso` e o que deu errado para `erro` (role="alert"), sempre com
    a frase que a action devolveu.

  A action nunca lança (devolve ResultadoVps); o que lança aqui é rede ou
  sessão vencida no meio do caminho, e isso vira uma frase também.
*/

export type Operacao = {
  /** O rótulo do que está andando ("" = livre). */
  ocupado: string;
  aviso: string;
  erro: string;
  codigo: CodigoVps | null;
  /** Erros por campo, do zod da action. */
  erros: Record<string, string>;
  executar<D>(
    rotulo: string,
    acao: () => Promise<ResultadoVps<D>>,
  ): Promise<ResultadoVps<D> | null>;
  /** Mostra um erro da própria tela (validação no navegador). */
  recusar(mensagem: string, erros?: Record<string, string>): void;
  limpar(): void;
};

/* Uma action que não chega ao fim (rede caiu, ou o proxy mandou a sessão
   vencida para o login) lança no navegador sem dizer qual dos dois. */
const FALHA_DESCONHECIDA =
  "Não foi possível falar com o painel. Confira a conexão (ou entre de novo, se a sessão expirou) e tente outra vez.";

export function useOperacao(): Operacao {
  const montado = useRef(true);
  const travado = useRef(false);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState<CodigoVps | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  function limpar() {
    setAviso("");
    setErro("");
    setCodigo(null);
    setErros({});
  }

  function recusar(mensagem: string, porCampo: Record<string, string> = {}) {
    setAviso("");
    setErro(mensagem);
    setCodigo("dados_invalidos");
    setErros(porCampo);
  }

  async function executar<D>(
    rotulo: string,
    acao: () => Promise<ResultadoVps<D>>,
  ): Promise<ResultadoVps<D> | null> {
    if (travado.current) return null;
    travado.current = true;
    setOcupado(rotulo);
    limpar();
    try {
      const resultado = await acao();
      if (montado.current) {
        if (resultado.ok) setAviso(resultado.mensagem);
        else {
          setErro(resultado.mensagem);
          setCodigo(resultado.codigo ?? null);
          setErros(resultado.erros ?? {});
        }
      }
      return resultado;
    } catch (causa) {
      if (montado.current) {
        setErro(
          causa instanceof ErroDoPainel ? causa.message : FALHA_DESCONHECIDA,
        );
        setCodigo(
          causa instanceof ErroDoPainel && causa.tipo === "sessao"
            ? "sem_sessao"
            : null,
        );
      }
      return null;
    } finally {
      travado.current = false;
      if (montado.current) setOcupado("");
    }
  }

  return { ocupado, aviso, erro, codigo, erros, executar, recusar, limpar };
}
