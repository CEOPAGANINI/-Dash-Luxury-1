"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  campaignClass,
  campaignClassLabel,
  isCampaignClass,
  normalizarClasse,
  type CampaignClassId,
} from "./campaign-classes";
import type { AdNetwork, CampaignRow, CampaignTree } from "./types";

export const CAMPAIGN_CLASSES_KEY = "dash-luxury:campaign-classes:v1";
type Assignments = Record<string, CampaignClassId>;
type Snapshot = { assignments: Assignments; notice: string };
const EMPTY: Snapshot = { assignments: {}, notice: "" };
let snapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const classSchema = z.custom<CampaignClassId>(isCampaignClass);
const schema = z.object({
  version: z.literal(1),
  assignments: z
    .record(
      z
        .string()
        .regex(/^(demo|banco):(meta|google|youtube):[a-zA-Z0-9-]{1,100}$/),
      classSchema,
    )
    .refine((value) => Object.keys(value).length <= 2000),
});

export function restoreCampaignClasses(raw: string): Assignments | null {
  try {
    const bruto = JSON.parse(raw) as unknown;
    // Ids de classes antigas viram a classe mais próxima antes de validar,
    // para uma etiqueta velha não invalidar o cofre inteiro.
    if (bruto && typeof bruto === "object" && "assignments" in bruto && bruto.assignments && typeof bruto.assignments === "object") {
      const migradas: Record<string, unknown> = {};
      for (const [chave, valor] of Object.entries(bruto.assignments as Record<string, unknown>)) {
        migradas[chave] = normalizarClasse(valor) ?? valor;
      }
      (bruto as { assignments: unknown }).assignments = migradas;
    }
    const result = schema.safeParse(bruto);
    return result.success ? result.data.assignments : null;
  } catch {
    return null;
  }
}

const keyFor = (mode: CampaignTree["modo"], network: AdNetwork, id: string) =>
  `${mode}:${network}:${id}`;

function load() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_CLASSES_KEY);
    const restored = raw ? restoreCampaignClasses(raw) : {};
    snapshot = {
      assignments: restored ?? {},
      notice:
        restored === null
          ? "As classes salvas não puderam ser lidas. Nenhuma campanha foi alterada."
          : "",
    };
  } catch {
    snapshot = {
      ...snapshot,
      notice:
        "Armazenamento indisponível: as classes serão mantidas somente nesta sessão.",
    };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === CAMPAIGN_CLASSES_KEY || event.key === null) {
    load();
    notify();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  if (!initialized) {
    initialized = true;
    load();
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function commit(assignments: Assignments, message: string) {
  let notice = message;
  try {
    localStorage.setItem(
      CAMPAIGN_CLASSES_KEY,
      JSON.stringify({ version: 1, assignments }),
    );
    notice += " Salva neste navegador; nenhuma rede de anúncios foi alterada.";
  } catch {
    notice += " Armazenamento indisponível; mantida somente nesta sessão.";
  }
  snapshot = { assignments, notice };
  notify();
}

export function resetDemoCampaignClasses() {
  if (!initialized) {
    initialized = true;
    load();
  }
  commit(
    Object.fromEntries(
      Object.entries(snapshot.assignments).filter(
        ([key]) => !key.startsWith("demo:"),
      ),
    ),
    "Classes dos exemplos restauradas.",
  );
}

export function useCampaignClasses(
  mode: CampaignTree["modo"],
  network: AdNetwork,
) {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
  return {
    notice: state.notice,
    resolve: (campaign: CampaignRow): CampaignClassId =>
      state.assignments[keyFor(mode, campaign.network, campaign.id)] ??
      campaignClass(campaign),
    assign: (id: string, value: CampaignClassId) => {
      const key = keyFor(mode, network, id);
      const assignments = { ...snapshot.assignments, [key]: value };
      if (!schema.safeParse({ version: 1, assignments }).success) {
        snapshot = {
          ...snapshot,
          notice:
            "Não foi possível salvar a classe. Verifique a campanha ou o limite de 2.000 etiquetas deste navegador.",
        };
        notify();
        return;
      }
      commit(assignments, `Classe: ${campaignClassLabel(value)}.`);
    },
  };
}
