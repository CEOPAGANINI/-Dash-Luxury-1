import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, LockKeyhole } from "lucide-react";

import { auditedSecurityChecks } from "@/features/security-center/audit";
import { unknownHeaderChecks } from "@/features/security-center/checks";
import { SecurityDashboard } from "@/features/security-center/security-dashboard";
import styles from "@/features/security-center/security-dashboard.module.css";
import { getLiveSecuritySnapshot } from "@/features/security-center/service";
import { getSession } from "@/lib/auth/session";
import { principalOperator } from "@/lib/workspace-policy";

export const metadata: Metadata = {
  title: "Segurança e privacidade",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/configuracoes/seguranca");

  if (session.demoMode || !principalOperator(session.user, process.env)) {
    return (
      <div className={styles.page}>
        <section className={styles.restricted}>
          <LockKeyhole aria-hidden="true" />
          <h2>Segurança e privacidade</h2>
          <p>
            Esta página fica disponível para o responsável pela infraestrutura.
            Use a conta autorizada para consultar as configurações da operação.
          </p>
          <Link href="/configuracoes">
            Voltar às configurações <ArrowUpRight aria-hidden="true" />
          </Link>
        </section>
      </div>
    );
  }

  const snapshot = await getLiveSecuritySnapshot();
  const checks = new Map(snapshot.checks.map((check) => [check.id, check]));
  unknownHeaderChecks().forEach((check) => checks.set(check.id, check));
  auditedSecurityChecks.forEach((check) => checks.set(check.id, check));

  return (
    <SecurityDashboard
      initialSnapshot={{ ...snapshot, checks: [...checks.values()] }}
    />
  );
}
