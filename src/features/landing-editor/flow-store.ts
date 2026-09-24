"use client";

import { useMemo, useSyncExternalStore } from "react";
import { INITIAL_FLOW, parseFlow, type LandingFlow } from "./flow-model";

type DraftSnapshot = { flow: LandingFlow; ready: boolean; notice: string };
const SERVER_SNAPSHOT: DraftSnapshot = {
  flow: INITIAL_FLOW,
  ready: false,
  notice: "",
};
const SAVED_EVENT = "orbit:landing-flow-saved";
const CORRUPT_NOTICE =
  "O rascunho local está corrompido ou usa uma versão incompatível. Os dados originais foram preservados; corrija ou remova esse rascunho do armazenamento e recarregue o editor antes de salvar.";
const UNAVAILABLE_NOTICE =
  "O armazenamento local está indisponível. Suas alterações não foram salvas; mantenha esta aba aberta.";
const CONFLICT_NOTICE =
  "O rascunho foi alterado em outra aba. Suas alterações nesta aba foram mantidas. Recarregue o editor antes de salvar para não sobrescrever a outra versão.";

export function landingFlowStorageKey(storageId: string): string {
  if (!storageId.trim() || storageId.length > 512) {
    throw new TypeError(
      "Informe um identificador de usuário válido para o rascunho.",
    );
  }
  return `orbit:landing-flow:v1:${encodeURIComponent(storageId)}`;
}

function createDraftStore(storageId: string) {
  const key = landingFlowStorageKey(storageId);
  const listeners = new Set<() => void>();
  let snapshot = SERVER_SNAPSHOT;
  let baseline: string | null | undefined;
  let corrupt = false;

  function publish(next: DraftSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function load() {
    try {
      baseline = window.localStorage.getItem(key);
      const parsed =
        baseline === null ? parseFlow(INITIAL_FLOW) : parseFlow(baseline);
      corrupt = parsed === null;
      publish({
        flow: parsed ?? parseFlow(INITIAL_FLOW)!,
        ready: true,
        notice: corrupt ? CORRUPT_NOTICE : "",
      });
    } catch {
      baseline = undefined;
      publish({
        flow: parseFlow(INITIAL_FLOW)!,
        ready: true,
        notice: UNAVAILABLE_NOTICE,
      });
    }
  }

  function checkExternalChange() {
    if (!snapshot.ready) return;
    try {
      if (window.localStorage.getItem(key) !== baseline) {
        // Do not replace the loaded flow: the editor may contain unsaved edits.
        publish({ ...snapshot, notice: CONFLICT_NOTICE });
      }
    } catch {
      publish({ ...snapshot, notice: UNAVAILABLE_NOTICE });
    }
  }

  function onStorage(event: StorageEvent) {
    if (event.key === key || event.key === null) checkExternalChange();
  }

  function onSaved(event: Event) {
    if ((event as CustomEvent<{ key: string }>).detail?.key === key)
      checkExternalChange();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        window.addEventListener("storage", onStorage);
        window.addEventListener(SAVED_EVENT, onSaved);
        if (!snapshot.ready) load();
        else checkExternalChange();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener(SAVED_EVENT, onSaved);
        }
      };
    },
    save: (flow: LandingFlow): boolean => {
      if (!snapshot.ready) {
        publish({
          ...snapshot,
          notice: "Aguarde o carregamento do rascunho antes de salvar.",
        });
        return false;
      }
      if (corrupt) {
        publish({ ...snapshot, notice: CORRUPT_NOTICE });
        return false;
      }
      if (baseline === undefined) {
        publish({ ...snapshot, notice: UNAVAILABLE_NOTICE });
        return false;
      }
      const parsed = parseFlow(flow);
      if (!parsed) {
        publish({
          ...snapshot,
          notice:
            "Não foi possível salvar: verifique os campos, destinos e conexões do fluxo.",
        });
        return false;
      }
      try {
        if (window.localStorage.getItem(key) !== baseline) {
          publish({ ...snapshot, notice: CONFLICT_NOTICE });
          return false;
        }
        const serialized = JSON.stringify(parsed);
        window.localStorage.setItem(key, serialized);
        baseline = serialized;
        publish({ flow: parsed, ready: true, notice: "" });
        window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { key } }));
        return true;
      } catch {
        publish({ ...snapshot, notice: UNAVAILABLE_NOTICE });
        return false;
      }
    },
  };
}

/** Local, user-scoped draft. Reading never writes; only an explicit Save persists. */
export function useLandingFlowDraft(storageId: string) {
  const store = useMemo(() => createDraftStore(storageId), [storageId]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return { ...snapshot, save: store.save };
}
