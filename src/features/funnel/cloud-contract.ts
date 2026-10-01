import { z } from "zod";
import { funnelEnvelopeSchema, type FunnelEnvelope } from "./funil-store";
import { preservePackageReferences } from "./package-references";

export const CLOUD_BODY_MAX_BYTES = 3_000_000;
export const cloudSaveSchema = z
  .object({
    revision: z.uuid().nullable(),
    envelope: funnelEnvelopeSchema,
  })
  .strict();

export type CloudVault = {
  envelope: FunnelEnvelope | null;
  revision: string | null;
};

/** Keep both drafts on divergence: same-id differences become named copies. */
export function mergeFunnelEnvelopes(
  remote: FunnelEnvelope,
  local: FunnelEnvelope,
): FunnelEnvelope {
  const result: FunnelEnvelope = structuredClone(remote);
  const preserve = (entry: FunnelEnvelope["funis"][number]) => {
    const existing = result.funis.find((item) => item.id === entry.id);
    if (
      existing &&
      JSON.stringify(existing.data) === JSON.stringify(entry.data)
    )
      return;
    const id = existing ? `funil-${crypto.randomUUID()}` : entry.id;
    result.funis.push({
      ...entry,
      id,
      nome: existing ? `${entry.nome} (cópia local preservada)` : entry.nome,
      data: {
        ...(existing ? preservePackageReferences(entry.data) : entry.data),
        id,
      },
    });
  };
  local.funis.forEach(preserve);
  if (
    remote.rascunho &&
    local.rascunho &&
    JSON.stringify(remote.rascunho) !== JSON.stringify(local.rascunho)
  ) {
    preserve({
      id: remote.rascunho.id,
      nome: `${remote.rascunho.nome} (versão do servidor)`,
      atualizadoEm: new Date().toISOString(),
      data: remote.rascunho,
    });
  }
  if (local.rascunho) result.rascunho = structuredClone(local.rascunho);
  for (const item of local.redirecionadores) {
    const existing = result.redirecionadores.find(
      (other) => other.id === item.id,
    );
    if (!existing) result.redirecionadores.push(item);
    else if (JSON.stringify(existing.estado) !== JSON.stringify(item.estado))
      result.redirecionadores.push({
        ...item,
        id: `redir-${crypto.randomUUID()}`,
        nome: `${item.nome} (cópia local)`,
      });
  }
  result.revisao = `rev-${crypto.randomUUID()}`;
  return funnelEnvelopeSchema.parse(result);
}

export function sameFunnelContents(
  a: FunnelEnvelope,
  b: FunnelEnvelope,
): boolean {
  return (
    JSON.stringify({ ...a, revisao: "" }) ===
    JSON.stringify({ ...b, revisao: "" })
  );
}
