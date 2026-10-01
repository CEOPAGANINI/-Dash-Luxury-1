import "@/features/settings/configuracoes-devmode.css";
import Link from "next/link";

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="cfg-nav" aria-label="Configurações">
        {[
          ["Visão geral", "/configuracoes"],
          ["Operação", "/configuracoes/operacao"],
          ["Equipe", "/configuracoes/acessos"],
          ["Pagamentos", "/configuracoes/pagamentos"],
          ["Catálogo", "/catalogo/produtos"],
          ["Diagnóstico", "/configuracoes/diagnosticos"],
          ["Integrações", "/integracoes"],
          ["Servidor", "/servidor"],
        ].map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
