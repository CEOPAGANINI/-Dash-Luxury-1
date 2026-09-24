import { Badge } from "@/components/ui/badge";
import styles from "@/components/command-layer/shell.module.css";

/**
 * Cabeçalho padrão das páginas do dashboard modular: título, função da
 * página em uma frase e o aviso de dados demonstrativos quando aplicável.
 */
export function PageHeader({
  title,
  description,
  demoMode,
  hideTitle = false,
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
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between ${styles.pageHeader}`}
    >
      <div>
        {/* Título da página: usa o token --text-page-title, o mesmo em
            qualquer tela do painel — nenhuma página tem um "grande" próprio. */}
        {hideTitle ? (
          <h2 className="sr-only">{title}</h2>
        ) : (
          <h2 className="text-[length:var(--text-page-title)] leading-tight font-extrabold tracking-tight">
            {title}
          </h2>
        )}
        <p className="text-muted-foreground mt-0.5 max-w-3xl text-[length:var(--text-body)] leading-5">
          {description}
        </p>
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
