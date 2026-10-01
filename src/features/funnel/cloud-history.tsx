"use client";
import * as React from "react";
import { funnelIdentityHeaders } from "./editor-identity";
import { mergeFunnelEnvelopes } from "./cloud-contract";
import { funnelEnvelopeSchema, type CofreFunil } from "./funil-store";
import type { FunnelData } from "./funnel-model";

export function FunnelCloudHistory({
  storageId,
  cofre,
  onRestored,
}: {
  storageId: string;
  cofre: CofreFunil;
  onRestored: (data: FunnelData | null) => void;
}) {
  const [items, setItems] = React.useState<
    { revision: string; createdAt: string; name: string; count: number }[]
  >([]);
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [message, setMessage] = React.useState("");
  async function request(query: string) {
    const response = await fetch(`/api/editor/funil?${query}`, {
      headers: funnelIdentityHeaders(storageId),
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.redirected)
      throw new Error("Sessão expirada. A cópia local continua guardada.");
    const value = await response.json();
    if (!response.ok || !value.ok)
      throw new Error(value.error || "Histórico indisponível.");
    return value;
  }
  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const value = await request("history=1");
      setItems(value.items);
      setLoaded(true);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Não foi possível consultar o histórico.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore(revision: string) {
    if (
      !window.confirm(
        "Restaurar esta versão? As alterações atuais serão preservadas como cópias em Meus funis; nenhum original será apagado.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const value = await request(`revision=${encodeURIComponent(revision)}`);
      const historical = funnelEnvelopeSchema.parse(value.envelope);
      const merged = mergeFunnelEnvelopes(cofre.exportarEnvelope(), historical);
      cofre.substituirEnvelope(merged);
      if (merged.rascunho) cofre.salvarRascunho(merged.rascunho);
      else cofre.removerRascunho();
      onRestored(merged.rascunho);
      setMessage(
        "Versão recuperada. As cópias anteriores estão preservadas e a sincronização foi solicitada.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "A restauração não foi confirmada. Suas versões foram preservadas.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="funnel__cloud-history" aria-label="Histórico da conta">
      <button
        type="button"
        className="funnel__btn"
        disabled={busy || storageId === "demo-user"}
        onClick={() => void load()}
      >
        {busy ? "Consultando versões…" : "Histórico e recuperação da conta"}
      </button>
      {message && <p role="status">{message}</p>}
      {loaded && (
        <>
          <p className="funnel__panel-hint">
            Até 20 versões anteriores deste workspace e usuário. Alterações só
            locais ainda não aparecem aqui.
          </p>
          {items.length === 0 ? (
            <p>Não há versões anteriores sincronizadas.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.revision}>
                  <span>
                    {item.name} ·{" "}
                    {new Date(item.createdAt).toLocaleString("pt-BR")} ·{" "}
                    {item.count} funis
                  </span>
                  <button
                    type="button"
                    className="funnel__btn"
                    disabled={busy}
                    onClick={() => void restore(item.revision)}
                  >
                    Recuperar versão
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
