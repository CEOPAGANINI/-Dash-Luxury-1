"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/painel", icone: "◎", texto: "Visão geral" },
  { href: "/painel/financeiro", icone: "⇄", texto: "Entradas e saídas" },
  { href: "/painel/campanhas", icone: "◆", texto: "Campanhas" },
  { href: "/painel/leads", icone: "☰", texto: "Leads" },
];

export default function MenuLateral() {
  const caminho = usePathname();

  return (
    <nav className="nav" aria-label="Seções do painel">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={caminho === item.href ? "page" : undefined}
        >
          <span className="icone" aria-hidden="true">
            {item.icone}
          </span>
          {item.texto}
        </Link>
      ))}
    </nav>
  );
}
