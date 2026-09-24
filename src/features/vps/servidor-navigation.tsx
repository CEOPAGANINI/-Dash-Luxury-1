"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Globe2, Server, Terminal } from "lucide-react";
import styles from "./servidor-nexus.module.css";

export function ServidorNavigation() {
  const pathname = usePathname();
  const sites = pathname.startsWith("/servidor/sites");
  const novo = pathname === "/servidor/novo";
  return (
    <nav aria-label="Navegação do servidor" className={styles.navigation}>
      <div className={styles.navigationLinks}>
        <Link
          href="/servidor"
          aria-current={!sites && !novo ? "page" : undefined}
        >
          <Server aria-hidden size={16} />
          <span>Servidores</span>
        </Link>
        <Link href="/servidor/sites" aria-current={sites ? "page" : undefined}>
          <Globe2 aria-hidden size={16} />
          <span>Sites e arquivos</span>
        </Link>
        <Link href="/servidor/novo" aria-current={novo ? "page" : undefined}>
          <Terminal aria-hidden size={16} />
          <span>Conectar VPS</span>
        </Link>
      </div>
      <Link className={styles.editorLink} href="/editor/landing-page">
        <span>Editor do funil</span>
        <ArrowUpRight aria-hidden size={16} />
      </Link>
    </nav>
  );
}
