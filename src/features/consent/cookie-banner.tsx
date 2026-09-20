"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";

import { useConsent, writeConsent } from "@/features/consent/use-consent";

/**
 * Aviso de cookies (RGPD + ePrivacy).
 *
 * Os píxeis de marketing só carregam depois de "Aceitar" — recusar mantém a
 * loja a funcionar apenas com o essencial. As duas opções têm o mesmo peso
 * visual, como exige a orientação europeia.
 */
export function CookieBanner() {
  const consent = useConsent();

  // `undefined` = ainda a hidratar; `null` = por decidir.
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden size-5 shrink-0 text-violet-600 sm:block" />
        <p className="flex-1 text-sm leading-relaxed text-zinc-700">
          Usamos cookies essenciais para a loja funcionar. Com a sua
          autorização, usamos também cookies de análise e marketing para medir
          campanhas.{" "}
          <Link href="/legal/cookies" className="text-violet-600 underline">
            Saber mais
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => writeConsent("rejected")}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 sm:flex-none"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => writeConsent("accepted")}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 sm:flex-none"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
