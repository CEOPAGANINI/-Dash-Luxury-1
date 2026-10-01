import type { Metadata } from "next";

import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Processador" };

export default function Page() {
  redirect("/configuracoes/pagamentos");
}
