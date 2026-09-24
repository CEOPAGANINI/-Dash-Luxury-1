import type { PendenciaVps } from "./acesso";
import { Bloco, ComoFunciona } from "./como-funciona";
import type { PainelVps } from "./queries";

/*
  O que as telas do Servidor mostram antes de existir painel para mostrar.

  Cada situação tem UMA frase honesta e nada mais: sem servidor de
  exemplo, sem número, sem formulário que não leva a lugar nenhum. A
  lista de configuração vem inteira de uma vez (✔/✘, o que é e onde
  pegar), para o dono não corrigir uma coisa e descobrir a próxima só
  depois do redeploy.
*/

export const FRASE_DO_DEMO =
  "Servidores só funcionam com login de verdade. No modo demonstração este painel não guarda nada e não envia nenhum comando a nenhuma VPS.";

export function PreRequisitos({
  pendencias,
  soFaltas = false,
}: {
  pendencias: PendenciaVps[];
  /** Nas telas de detalhe basta o que falta; na lista, tudo com ✔/✘. */
  soFaltas?: boolean;
}) {
  const faltas = pendencias.filter((p) => !p.ok);
  const lista = soFaltas ? faltas : pendencias;
  if (lista.length === 0) return null;
  return (
    <Bloco
      rotulo="Configuração"
      titulo={
        faltas.length === 0
          ? "Tudo configurado"
          : faltas.length === 1
            ? "Falta 1 item para o Servidor funcionar"
            : `Faltam ${faltas.length} itens para o Servidor funcionar`
      }
      descricao="Variáveis na Vercel valem no próximo deploy. As que começam com NEXT_PUBLIC entram no build: trocar exige redeploy."
    >
      <ul className="divide-border/60 divide-y">
        {lista.map((p) => (
          <li key={p.chave} className="flex min-w-0 items-start gap-2.5 py-2.5">
            <span
              aria-hidden
              className={
                p.ok
                  ? "text-success w-4 shrink-0 text-sm leading-6 font-bold"
                  : "text-destructive w-4 shrink-0 text-sm leading-6 font-bold"
              }
            >
              {p.ok ? "✔" : "✘"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6 break-words">
                <span className="sr-only">{p.ok ? "Pronto: " : "Falta: "}</span>
                {p.texto}
              </p>
              {!p.ok && (
                <p className="text-muted-foreground text-xs leading-5 break-words">
                  Onde pegar: {p.ondePegar}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

/**
 * As telas do Servidor quando `lerPainelVps` não devolve `ok`: demo, sem
 * permissão, configuração faltando ou erro de leitura. Erro nunca vira
 * lista vazia: aparece em role="alert" com o motivo.
 */
export function PainelIndisponivel({
  painel,
}: {
  painel: Exclude<PainelVps, { estado: "ok" }>;
}) {
  switch (painel.estado) {
    case "demo":
      return (
        <>
          <p className="text-muted-foreground max-w-3xl text-sm leading-6">
            {FRASE_DO_DEMO}
          </p>
          <ComoFunciona />
        </>
      );
    case "sem_permissao":
      return (
        <p className="text-muted-foreground max-w-3xl text-sm leading-6">
          {painel.motivo}
        </p>
      );
    case "configurar":
      return <PreRequisitos pendencias={painel.pendencias} />;
    case "erro":
      return (
        <p
          role="alert"
          className="text-destructive max-w-3xl text-sm leading-6 break-words"
        >
          Não foi possível ler os servidores: {painel.mensagem}
        </p>
      );
  }
}
