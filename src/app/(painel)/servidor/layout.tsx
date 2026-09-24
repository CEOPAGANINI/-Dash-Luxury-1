import localFont from "next/font/local";
import { ServidorNavigation } from "@/features/vps/servidor-navigation";
import styles from "@/features/vps/servidor-nexus.module.css";

const display = localFont({
  src: "../../../features/vps/fonts/space-grotesk.woff2",
  variable: "--font-server-display",
  weight: "400 700",
  display: "swap",
});
const mono = localFont({
  src: "../../../features/vps/fonts/space-mono.woff2",
  variable: "--font-server-mono",
  weight: "400",
  display: "swap",
});

export default function ServidorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="server-console"
      data-server-design="nexus"
      className={`${display.variable} ${mono.variable} ${styles.scope}`}
    >
      <ServidorNavigation />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
