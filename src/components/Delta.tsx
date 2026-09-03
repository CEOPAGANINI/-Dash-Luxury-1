import { porcentagem } from "@/lib/format";

/**
 * Seta de variacao entre dois periodos. Quando o periodo anterior foi zero
 * nao existe percentual honesto — mostramos "sem base" em vez de inventar.
 */
export default function Delta({
  valor,
  sufixo = "vs. período anterior",
}: {
  valor: number | null;
  sufixo?: string;
}) {
  if (valor === null) {
    return (
      <span className="apoio">
        <span className="delta neutro">— sem base</span> {sufixo}
      </span>
    );
  }

  const sobe = valor >= 0;
  return (
    <span className="apoio">
      <span className={`delta ${sobe ? "sobe" : "desce"}`}>
        {sobe ? "▲" : "▼"} {porcentagem(Math.abs(valor))}
      </span>{" "}
      {sufixo}
    </span>
  );
}
