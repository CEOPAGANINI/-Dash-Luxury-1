import { funnelEnvelopeSchema, type CofreFunil } from "./funil-store";
import {
  mergeFunnelEnvelopes,
  sameFunnelContents,
  type CloudVault,
} from "./cloud-contract";
import { funnelIdentityHeaders } from "./editor-identity";

export type FunnelSyncStatus = {
  /** "local": demonstração, só este navegador — não é erro nem tem o que tentar de novo. */
  state: "loading" | "pending" | "saved" | "error" | "local";
  message: string;
};

/** Local writes are synchronous; network saves run serially and use compare-and-swap. */
export function connectFunnelCloud(
  storageId: string,
  cofre: CofreFunil,
  onStatus: (status: FunnelSyncStatus) => void,
  onLoaded: () => void,
) {
  let ready = false;
  let busy = false;
  let paused = false;
  let disposed = false;
  let revision: string | null = null;
  let sentLocalRevision = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading = false;
  const markerKey = `${cofre.chave}:cloud`;
  const status = (value: FunnelSyncStatus) => {
    if (!disposed) onStatus(value);
  };
  const request = async (init: RequestInit = {}) => {
    const response = await fetch("/api/editor/funil", {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { ...funnelIdentityHeaders(storageId), ...init.headers },
    });
    if (response.redirected)
      throw new Error("Sua sessão expirou. A cópia local continua disponível.");
    const body = await response.json();
    if (!response.ok || body.ok !== true)
      throw new Error(
        body.error ||
          "Sincronização indisponível; alterações guardadas neste navegador.",
      );
    return body;
  };
  async function flush() {
    if (!ready || busy || paused) return;
    const envelope = cofre.exportarEnvelope();
    if (envelope.revisao === sentLocalRevision) return;
    busy = true;
    status({
      state: "pending",
      message: "Guardado neste navegador · sincronizando…",
    });
    try {
      const response = await request({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, envelope }),
      });
      revision = response.revision;
      sentLocalRevision = envelope.revisao;
      try {
        localStorage.setItem(
          markerKey,
          JSON.stringify({
            serverRevision: revision,
            localRevision: sentLocalRevision,
          }),
        );
      } catch {
        /* The vault already reports local storage failures. */
      }
      status({
        state: "saved",
        message: "Salvo automaticamente · sincronizado na sua conta",
      });
    } catch (error) {
      paused = true;
      status({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar. A cópia local foi preservada.",
      });
    } finally {
      busy = false;
      if (!paused && cofre.exportarEnvelope().revisao !== sentLocalRevision)
        void flush();
    }
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    status({
      state: "pending",
      message: "Guardado neste navegador · sincronizando…",
    });
    timer = setTimeout(() => void flush(), 600);
  }
  const unsubscribe = cofre.subscribe(schedule);
  async function start() {
    if (loading || busy) return;
    loading = true;
    paused = false;
    ready = false;
    status({ state: "loading", message: "Conferindo a versão da sua conta…" });
    try {
      const remote = (await request()) as CloudVault;
      revision = remote.revision;
      const local = cofre.exportarEnvelope();
      let marker: { serverRevision?: string; localRevision?: string } = {};
      try {
        marker = JSON.parse(localStorage.getItem(markerKey) ?? "{}");
      } catch {
        /* First sync or expired marker. */
      }
      if (remote.envelope) {
        const parsed = funnelEnvelopeSchema.parse(remote.envelope);
        const empty =
          !local.rascunho &&
          !local.funis.length &&
          !local.redirecionadores.length;
        if (!sameFunnelContents(local, parsed)) {
          if (empty || marker.localRevision === local.revisao)
            cofre.substituirEnvelope(parsed);
          else if (marker.serverRevision !== revision)
            cofre.substituirEnvelope(mergeFunnelEnvelopes(parsed, local));
          // Otherwise only this browser changed since its last successful sync.
          if (!disposed) onLoaded();
        }
        if (sameFunnelContents(cofre.exportarEnvelope(), parsed)) {
          sentLocalRevision = cofre.revisao;
          try {
            localStorage.setItem(
              markerKey,
              JSON.stringify({
                serverRevision: revision,
                localRevision: sentLocalRevision,
              }),
            );
          } catch {
            /* Local data remains authoritative until a successful write. */
          }
        }
      }
      ready = true;
      if (sentLocalRevision === cofre.revisao)
        status({ state: "saved", message: "Sincronizado na sua conta" });
      else schedule();
    } catch (error) {
      paused = true;
      status({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Sincronização indisponível. A cópia local foi preservada.",
      });
    } finally {
      loading = false;
    }
  }
  void start();
  return {
    retry: start,
    stop() {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      // Keep the last save alive across a Next.js navigation.
      void flush();
    },
  };
}
