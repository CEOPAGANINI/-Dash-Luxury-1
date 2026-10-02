import { Play, ShoppingBag } from "lucide-react";
import styles from "./meta-business-panel.module.css";

export function MetaDemoCreative({
  id,
  title,
  body,
}: {
  id: string;
  title?: string;
  body?: string;
}) {
  const video = id.endsWith("-1");
  return (
    <details>
      <summary>Ver prévia do criativo · demonstração</summary>
      <div className={styles.creative}>
        <div className={styles.creativeHead}>
          <b>Loja de exemplo</b>
          <small>Patrocinado · demonstração</small>
        </div>
        <p>{body ?? "Conheça a coleção e aproveite o frete grátis."}</p>
        <div
          className={styles.creativeArt}
          aria-label={
            video
              ? "Prévia ilustrativa de vídeo"
              : "Prévia ilustrativa de carrossel"
          }
        >
          <ShoppingBag size={52} />
          <strong>Seu próximo favorito</strong>
          <span>COLEÇÃO EXEMPLO</span>
          {video ? (
            <span className={styles.play}>
              <Play size={18} /> Vídeo ilustrativo · 20 segundos
            </span>
          ) : (
            <span>● ○ ○ ○ · Carrossel de 4 cards</span>
          )}
        </div>
        <div className={styles.creativeFooter}>
          <strong>{title ?? "Conheça a coleção"}</strong>
          <span>Comprar agora · exemplo</span>
        </div>
      </div>
    </details>
  );
}
