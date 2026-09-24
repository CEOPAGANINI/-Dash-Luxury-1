import { cn } from "@/lib/utils";
import styles from "@/components/command-layer/shell.module.css";

export type PageSectionTone =
  "neutral" | "success" | "warning" | "info" | "destructive";

interface PageSectionProps {
  id: string;
  /** Rótulo "Parte 01 · ..." no alto da sessão. Sem ele, só o título aparece. */
  number?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
  tone?: PageSectionTone;
  aside?: React.ReactNode;
  /** Renderiza só o conteúdo, sem cartão nem cabeçalho — para páginas que já se apresentam sozinhas. */
  bare?: boolean;
}

const sectionTone: Record<PageSectionTone, string> = {
  neutral: "border-border bg-card/45",
  success: "border-success/20 bg-success/[0.025]",
  warning: "border-warning/25 bg-warning/[0.03]",
  info: "border-info/20 bg-info/[0.025]",
  destructive: "border-destructive/20 bg-destructive/[0.025]",
};

const sectionIconTone: Record<PageSectionTone, string> = {
  neutral: "bg-muted text-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
};

/**
 * Bloco padrão para agrupar um pedaço de página: ícone, título, descrição
 * opcional e o conteúdo dentro de uma placa com borda colorida pelo tom.
 *
 * Toda página do painel usa este componente para separar seus grupos de
 * elementos — cada sessão é visualmente independente da vizinha, com o
 * mesmo espaçamento e escala de texto em qualquer tela.
 */
export function PageSection({
  id,
  number,
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  tone = "neutral",
  aside,
  bare = false,
}: PageSectionProps) {
  if (bare) {
    return (
      <section id={id} className="scroll-mt-24" aria-label={title}>
        <div className="space-y-4 sm:space-y-5">{children}</div>
      </section>
    );
  }

  return (
    <section
      id={id}
      className={cn(`scroll-mt-24 ${styles.section}`, sectionTone[tone])}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.sectionInner}>
        <header className={`border-b ${styles.sectionHeading}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <span
                className={cn(
                  `grid size-11 shrink-0 place-items-center ${styles.sectionIcon}`,
                  sectionIconTone[tone],
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                {/* Sem caixa alta: texto todo em maiúsculas é mais difícil de
                  ler para quem tem dislexia, porque some o contorno da palavra. */}
                {(number || eyebrow) && (
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] font-bold">
                    {number && (
                      <span className="text-foreground">Parte {number}</span>
                    )}
                    {number && eyebrow && <span aria-hidden>·</span>}
                    {eyebrow && <span>{eyebrow}</span>}
                  </div>
                )}
                <h2
                  id={`${id}-title`}
                  className="mt-1.5 text-[length:var(--text-section-title)] leading-tight font-extrabold tracking-[-0.025em]"
                >
                  {title}
                </h2>
                {description && (
                  <p className="text-muted-foreground mt-1.5 max-w-3xl text-[length:var(--text-body)] leading-6">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {aside ? <div className="shrink-0">{aside}</div> : null}
          </div>
        </header>
        <div className={`space-y-4 sm:space-y-5 ${styles.sectionContent}`}>
          {children}
        </div>
      </div>
    </section>
  );
}
