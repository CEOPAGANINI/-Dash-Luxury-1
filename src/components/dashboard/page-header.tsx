import { Badge } from "@/components/ui/badge";
import styles from "@/components/command-layer/shell.module.css";

import { PageEyebrow } from "./page-eyebrow";

/**
 * Cabeçalho padrão das páginas do dashboard modular, no desenho do design
 * system Futurist Workflow: eyebrow (a pasta do menu, caixa alta pequena
 * com filete ciano), título em Inter 500 com tracking negativo e a função
 * da página numa frase leve. O aviso de dados demonstrativos continua à
 * direita quando aplicável.
 */
export function PageHeader({
  title,
  description,
  demoMode,
  hideTitle = false,
  eyebrow,
}: {
  title: string;
  description: string;
  demoMode?: boolean;
  /**
   * Esconde o título quando algo acima já nomeia a página — nas áreas do
   * dashboard, a aba acesa faz esse papel, e repetir a palavra logo abaixo
   * gastava uma linha inteira para não dizer nada novo.
   */
  hideTitle?: boolean;
  /** Texto do eyebrow; sem ele, usa a pasta do menu da página atual. */
  eyebrow?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between fw-page-header ${styles.pageHeader}`}
    >
      <div className="flex flex-col gap-3">
        <PageEyebrow texto={eyebrow} />
        {/* Título da página: o mesmo tamanho em qualquer tela do painel —
            nenhuma página tem um "grande" próprio. */}
        {hideTitle ? (
          <h2 className="sr-only">{title}</h2>
        ) : (
          <h2 className="leading-tight tracking-tight">{title}</h2>
        )}
        <p className="text-muted-foreground max-w-3xl">{description}</p>
      </div>
      {demoMode !== undefined && (
        <Badge variant="warning">
          {demoMode
            ? "Sem dados · métricas zeradas"
            : "Exemplo — dados reais chegam na Fase 5"}
        </Badge>
      )}
    </div>
  );
}
