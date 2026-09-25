/* O quadro do funil vive em /editor/landing-page; a pele dele (a mesa
   escura de pontinhos com cards claros) é carregada aqui. É escopada em
   .funnel, então não afeta as outras rotas do editor. */
import "@/features/funnel/funnel.css";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
