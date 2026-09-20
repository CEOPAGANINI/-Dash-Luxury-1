"use client";

import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";

import { cn } from "@/lib/utils";
import { CONNECTION_META, useDataConnections } from "@/lib/data-connections";

/**
 * Conexões necessárias.
 *
 * A lista do que precisa ser ligado para o painel trocar os números
 * demonstrativos pelos reais: as redes de anúncio, o gateway do checkout e a
 * loja. Cada linha diz o que aquela conexão destrava e leva direto para a
 * placa daquela fonte na página de Integrações, onde a configuração de fato
 * acontece.
 *
 * O estado é o mesmo da página de Integrações (src/lib/data-connections):
 * configurou lá, o placar daqui muda na hora.
 */
export function ConnectionsChecklist({ demoMode }: { demoMode: boolean }) {
  const { connections, ready } = useDataConnections();
  const connected = ready
    ? CONNECTION_META.filter((item) => connections[item.id]).length
    : 0;

  return (
    <section
      aria-labelledby="conexoes-titulo"
      className="@container bg-card flex min-w-0 flex-col overflow-hidden rounded-2xl border"
    >
      <header className="flex items-start gap-2.5 border-b px-4 py-3">
        <span
          aria-hidden
          className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border"
        >
          <Plug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
            Conexões
          </span>
          <h3
            id="conexoes-titulo"
            className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight"
          >
            O que falta conectar
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs leading-5">
            {demoMode
              ? "Cada fonte configurada fica pronta para sincronização; até lá, todos os números permanecem zerados."
              : "Cada fonte configurada alimenta os painéis com os números reais."}
          </p>
        </div>
        {/* O placar diz de longe quanto falta; a barra embaixo é o mesmo
            número dito em comprimento. */}
        <span className="text-muted-foreground shrink-0 text-xs leading-4 font-bold tabular-nums">
          {connected} de {CONNECTION_META.length}
          <span className="font-medium"> configuradas</span>
        </span>
      </header>

      <span aria-hidden className="bg-muted/60 flex h-0.5 overflow-hidden">
        <span
          className="bg-success"
          style={{ width: `${(connected / CONNECTION_META.length) * 100}%` }}
        />
      </span>

      <ul className="divide-border/60 flex-1 divide-y">
        {CONNECTION_META.map((item) => {
          const stored = ready ? connections[item.id] : undefined;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-2 px-4 py-3 @xl:flex-row @xl:items-center @xl:gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 @xl:w-56 @xl:shrink-0">
                <i
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: `0 0 7px ${item.color}`,
                  }}
                />
                <span className="min-w-0">
                  <b className="block truncate text-sm leading-5 font-extrabold">
                    {item.name}
                  </b>
                  <span className="text-muted-foreground block truncate text-[0.6875rem] leading-4">
                    {stored ? stored.identifier : item.category}
                  </span>
                </span>
              </span>

              <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-5">
                {item.unlocks}
              </p>

              <span className="flex shrink-0 items-center gap-2">
                {/* O estado nunca é só cor: a palavra diz o que a bolinha
                    mostra. */}
                <span
                  className={cn(
                    "rounded-md border px-2 py-1 text-[0.6875rem] leading-4 font-bold whitespace-nowrap",
                    stored
                      ? "border-success/40 text-success bg-success/10"
                      : "border-warning/40 text-warning bg-warning/10",
                  )}
                >
                  {stored ? "Configurada" : "Não configurada"}
                </span>
                <Link
                  href={`/integracoes#conexao-${item.id}`}
                  className={cn(
                    "focus-visible:ring-ring flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none",
                    stored
                      ? "border-input hover:bg-muted/30 border"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {stored ? "Gerenciar" : "Conectar"}
                  <ArrowRight aria-hidden className="size-3" />
                </Link>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground border-t px-4 py-2.5 text-xs leading-5">
        A configuração acontece na página de{" "}
        <Link
          href="/integracoes"
          className="text-primary focus-visible:ring-ring font-bold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Integrações
        </Link>
        , com o passo a passo de onde pegar cada credencial.
      </p>
    </section>
  );
}
