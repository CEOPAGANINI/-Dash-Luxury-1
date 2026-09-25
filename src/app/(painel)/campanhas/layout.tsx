import localFont from "next/font/local";

import "@/features/ads/campaigns.css";
/* O quadro "Por classe" no Lumen: carregado depois, para vencer as
   camadas antigas de campaigns.css só onde o quadro pede. */
import "@/features/ads/class-board-lumen.css";

/* Geist, a fonte do Lumen Design System (arquivo do kit, variável 100–900). */
const geist = localFont({
  src: "../../../features/ads/fonts/geist.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

export default function CampaignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`campaign-workspace ${geist.variable}`}>{children}</div>;
}
