import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Montserrat, Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { brand } from "@/lib/brand";
import "./globals.css";
import "./command-layer.css";

/*
  Sistema de fontes em três papéis:
  - Outfit (display): a fonte do PicGen — títulos, menus e controlos;
  - Montserrat (display legado): usada pelas peles anteriores;
  - Inter (interface/dados): textos, controles, tabelas e números;
  - JetBrains Mono (técnica): IDs, códigos e timestamps copiáveis.
*/
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

/* A fonte que o PicGen mostra por extenso na sua folha de estilo. */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${outfit.variable} ${montserrat.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/* Dois temas: preto (padrão) e branco com preto. O escolhido fica
            guardado no navegador e entra em <html data-tema="…">. */}
        <ThemeProvider
          attribute="data-tema"
          themes={["preto", "branco"]}
          defaultTheme="preto"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
