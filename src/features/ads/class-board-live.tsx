"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { syncMetaAction } from "./actions";

/*
  O quadro ao vivo (só com banco): enquanto a aba está visível, recarrega
  os números a cada minuto e, com o Meta conectado, puxa do Meta a cada
  cinco minutos (o Meta mesmo só recalcula os relatórios de tempos em
  tempos; pedir mais vezes repete os mesmos números e gasta o limite da
  API). A ordem dos blocos segue o ROAS novo, deslizando. Na
  demonstração não há rede: a ordem muda quando a simulação muda.
*/
export const INTERVALO_AO_VIVO_MS = 60_000;
export const INTERVALO_META_MS = 5 * 60_000;

export function QuadroAoVivo({ metaConectado }: { metaConectado: boolean }) {
  const router = useRouter();
  const [ultima, setUltima] = React.useState("");
  /* Voltas desde a última puxada do Meta: uma a cada minuto; a cada
     cinco, sincroniza antes de recarregar. Fica numa referência para
     não zerar se o efeito reiniciar. */
  const voltasSemMeta = React.useRef(0);
  React.useEffect(() => {
    let ativo = true;
    let ocupado = false;
    const voltasEntreMetas = Math.max(1, Math.round(INTERVALO_META_MS / INTERVALO_AO_VIVO_MS));
    const atualizar = async () => {
      if (!ativo || ocupado || document.visibilityState === "hidden") return;
      ocupado = true;
      try {
        voltasSemMeta.current += 1;
        if (metaConectado && voltasSemMeta.current >= voltasEntreMetas) {
          voltasSemMeta.current = 0;
          await syncMetaAction();
        }
        if (!ativo) return;
        router.refresh();
        setUltima(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      } catch {
        // Sem rede agora: tenta de novo na próxima volta.
      } finally {
        ocupado = false;
      }
    };
    const timer = window.setInterval(() => void atualizar(), INTERVALO_AO_VIVO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [metaConectado, router]);
  return (
    <span className="sr-only" aria-live="polite" data-ao-vivo={ultima ? "true" : "esperando"}>
      {ultima ? `Números atualizados às ${ultima}.` : ""}
    </span>
  );
}
