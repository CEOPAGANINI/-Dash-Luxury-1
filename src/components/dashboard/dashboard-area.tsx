import type { ReactNode } from "react";

/**
 * Painel de sessão numerado usado pelas páginas do dashboard: título,
 * descrição curta e conteúdo agrupado — nada de cards soltos sem relação.
 */
export function DashboardArea({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-2xl border shadow-xs">
      <header className="bg-muted/25 border-b px-4 py-4 sm:px-5">
        <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
          Seção {number}
        </p>
        <h3 className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">
          {title}
        </h3>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-5">
          {description}
        </p>
      </header>
      <div className="space-y-5 p-3 sm:p-5">{children}</div>
    </section>
  );
}
