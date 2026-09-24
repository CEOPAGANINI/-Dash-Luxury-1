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
  src: [
    { path: "../../../features/vps/fonts/space-mono.woff2", weight: "400" },
    { path: "../../../features/vps/fonts/space-mono-700.woff2", weight: "700" },
  ],
  variable: "--font-server-mono",
  display: "swap",
});
/* A letra de pixel dos títulos e números do Nexus Arcade. */
const pixel = localFont({
  src: "../../../features/vps/fonts/vt323.woff2",
  variable: "--font-server-pixel",
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
      className={`${display.variable} ${mono.variable} ${pixel.variable} ${styles.scope}`}
    >
      <ServidorNavigation />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
