import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/** Todas as áreas do dashboard compartilham um contêiner neutro. */
export default function DashboardSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
