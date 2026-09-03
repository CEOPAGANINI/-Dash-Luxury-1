export default function Cartao({
  rotulo,
  valor,
  children,
}: {
  rotulo: string;
  valor: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="cartao">
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor}</span>
      {children}
    </article>
  );
}
