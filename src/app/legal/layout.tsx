import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { company, isCompanyComplete } from "@/lib/company";

const PAGES = [
  { href: "/legal/termos", label: "Termos e Condições" },
  { href: "/legal/privacidade", label: "Política de Privacidade" },
  { href: "/legal/cookies", label: "Política de Cookies" },
  { href: "/legal/devolucoes", label: "Trocas e Devoluções" },
  { href: "/legal/envios", label: "Envios e Entregas" },
];

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const complete = isCompanyComplete();

  return (
    <div className="min-h-svh bg-white text-zinc-900">
      <header className="bg-zinc-950 py-4">
        <div className="mx-auto max-w-4xl px-4">
          <Link
            href="/"
            className="text-xl font-black tracking-tight text-white"
          >
            Tech<span className="text-violet-400">Nébula</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {!complete && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong>Página incompleta.</strong> Os dados de identificação da
              empresa (denominação, NIF e morada) ainda não foram preenchidos em{" "}
              <code className="font-mono text-xs">src/lib/company.ts</code>. A
              lei portuguesa exige estas informações antes de vender ao público.
            </p>
          </div>
        )}

        <article className="prose-zinc max-w-none space-y-4 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:leading-relaxed [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </article>

        <nav className="mt-12 border-t pt-6">
          <p className="mb-3 text-xs font-bold tracking-wider text-zinc-500 uppercase">
            Outras informações legais
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="text-violet-600 hover:underline">
                  {p.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="https://www.livroreclamacoes.pt/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:underline"
              >
                Livro de Reclamações
              </a>
            </li>
          </ul>
        </nav>
      </main>

      <footer className="border-t bg-zinc-50 py-6 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} {company.tradeName}
      </footer>
    </div>
  );
}
