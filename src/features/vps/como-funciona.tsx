import * as React from "react";

import { cn } from "@/lib/utils";

/*
  Peças de apresentação do Servidor que não dependem do navegador: a
  moldura de bloco usada por todas as telas e o bloco "Como funciona" do
  modo demonstração. Sem "use client": a página (Server Component) desenha
  o demo sem mandar JavaScript nenhum, e as ilhas reusam a mesma moldura.

  O bloco segue a convenção do painel (seguranca, integracoes): section
  bg-card com borda e raio de 16, header como filho direto, h3 no título.
  Sem ícone decorativo e sem CSS module — layout só com Tailwind, para a
  pele Orbit mandar na superfície.
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
    <section
      className={cn("bg-card min-w-0 overflow-hidden border", className)}
    >
      <header className="flex flex-wrap items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          {rotulo && (
            <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
              {rotulo}
            </span>
          )}
          <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight break-words">
            {titulo}
          </h3>
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
          <div className="min-w-0">{children}</div>
        ) : (
          <div className="min-w-0 space-y-3 px-4 py-4">{children}</div>
        ))}
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
