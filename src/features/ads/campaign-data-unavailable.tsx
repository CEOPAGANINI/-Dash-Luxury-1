"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CampaignDataUnavailable({ title }: { title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="campaign-manager">
      <header className="campaign-page-heading">
        <div>
          <p className="campaign-eyebrow">Campanhas</p>
          <h1>{title}</h1>
        </div>
      </header>
      <div className="campaign-empty" role="alert">
        <h2>Não foi possível consultar as campanhas</h2>
        <p>
          A conexão com o banco está indisponível. Indicadores e edição ficam
          suspensos até a leitura ser restabelecida.
        </p>
        <p>
          Isso não significa que suas campanhas foram apagadas ou que os
          resultados são zero.
        </p>
        <div className="campaign-toolbar">
          <button
            type="button"
            className="campaign-control"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {pending ? "Consultando…" : "Tentar novamente"}
          </button>
          <Link href="/integracoes" className="campaign-control">
            Ver integrações
          </Link>
          <Link href="/campanhas" className="campaign-control">
            Voltar à demonstração
          </Link>
        </div>
      </div>
    </section>
  );
}
