import { ServidorNavigation } from "@/features/vps/servidor-navigation";
import styles from "@/features/vps/servidor-nexus.module.css";

export default function ServidorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="server-console"
      data-server-design="commandlayer"
      className={styles.scope}
    >
      <ServidorNavigation />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
