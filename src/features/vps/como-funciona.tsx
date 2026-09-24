import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./servidor-nexus.module.css";

/*
  Peças de apresentação do Servidor que não dependem do navegador: a
  moldura de bloco usada por todas as telas e o bloco "Como funciona" do
  modo demonstração. Sem "use client": a página (Server Component) desenha
  o demo sem mandar JavaScript nenhum, e as ilhas reusam a mesma moldura.

  O bloco usa a moldura CommandLayer em duas camadas. A camada interna
  mantém o cabeçalho, o conteúdo e os estados reais do servidor.
*/

export function Bloco({
  rotulo,
  titulo,
  descricao,
  acoes,
  children,
  semRespiro = false,
  className,
}: {
  /** O sobretítulo miúdo em maiúsculas. */
  rotulo?: string;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Botões ou links à direita do título. */
  acoes?: React.ReactNode;
  children?: React.ReactNode;
  /** Tabela encostada nas bordas do bloco, como na página Segurança. */
  semRespiro?: boolean;
  className?: string;
}) {
  return (
    <section className={cn(styles.panel, className)}>
      <div className={styles.panelInner}>
        <header className={styles.panelHeader}>
          <div className="min-w-0 flex-1">
            {rotulo && <span className={styles.panelLabel}>{rotulo}</span>}
            <h3 className={styles.panelTitle}>{titulo}</h3>
            {descricao && (
              <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                {descricao}
              </p>
            )}
          </div>
          {acoes && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {acoes}
            </div>
          )}
        </header>
        {children !== undefined &&
          (semRespiro ? (
            <div className={styles.panelFlush}>{children}</div>
          ) : (
            <div className={cn(styles.panelBody, "space-y-4")}>{children}</div>
          ))}
      </div>
    </section>
  );
}

/** A frase de vazio: uma linha, sem ilustração nem caixa de 320 px. */
export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm leading-6">{children}</p>;
}

/**
 * O que acontece, em texto e sem nenhum dado: é o que o modo demonstração
 * mostra no lugar de um servidor de exemplo (que seria mentira, mesmo
 * rotulado).
 */
export function ComoFunciona() {
  return (
    <Bloco
      rotulo="Como funciona"
      titulo="Do comando ao site no ar"
      descricao="O painel não guarda senha da VPS e não abre conexão com ela: quem busca as tarefas é o agente instalado no servidor."
    >
      <ol className="grid gap-3 md:grid-cols-3">
        <li className="bg-muted/20 min-w-0 border px-3 py-3">
          <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
            1 · Conectar
          </span>
          <p className="mt-1 text-sm leading-6">
            Cole um comando no console da VPS. Ele instala o agente e mostra
            aqui o servidor para você confirmar que é o seu.
          </p>
        </li>
        <li className="bg-muted/20 min-w-0 border px-3 py-3">
          <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
            2 · Apontar o domínio
          </span>
          <p className="mt-1 text-sm leading-6">
            Crie o site e aponte o DNS do domínio para o servidor. Quando o DNS
            fica certo, o HTTPS é pedido sozinho.
          </p>
        </li>
        <li className="bg-muted/20 min-w-0 border px-3 py-3">
          <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
            3 · Enviar o ZIP
          </span>
          <p className="mt-1 text-sm leading-6">
            Envie as páginas em ZIP. O servidor guarda cada versão, e o painel
            só diz &ldquo;No ar&rdquo; depois de conferir o domínio pelo lado de
            fora.
          </p>
        </li>
      </ol>
    </Bloco>
  );
}
