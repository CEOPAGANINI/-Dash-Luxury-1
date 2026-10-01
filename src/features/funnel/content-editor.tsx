"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { PageExportPanel } from "@/features/landing-editor/page-export-panel";
import { FLOW_LIMITS } from "@/features/landing-editor/flow-model";
import type { SitePackage } from "@/features/landing-editor/site-package";
import { contentFlowForPage } from "./content-flow";
import type { FunnelData, FunnelNode } from "./funnel-model";
import styles from "./content-editor.module.css";

export function FunnelContentEditor({
  data,
  nodeId,
  site,
  onSiteChange,
  onChange,
  onPrepareZip,
  onClose,
}: {
  data: FunnelData;
  nodeId: string;
  site: SitePackage | null;
  onSiteChange: (site: SitePackage | null) => void;
  onChange: (patch: Partial<FunnelNode>) => void;
  onPrepareZip: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const node = data.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  let flow;
  let error = "";
  try {
    flow = contentFlowForPage(data, nodeId);
  } catch (cause) {
    error =
      cause instanceof Error
        ? cause.message
        : "Não foi possível preparar esta página.";
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <header className={styles.header}>
            <div>
              <Dialog.Title>Editar conteúdo de {node.title}</Dialog.Title>
              <Dialog.Description>
                Esta é a mesma página do quadro. Edite o conteúdo ou importe
                seus arquivos e prepare o ZIP antes de publicar.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className={styles.close}
              aria-label="Voltar à configuração da página"
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <div className={styles.fields}>
            <label>
              Nome da página
              <input
                maxLength={FLOW_LIMITS.name}
                value={node.title}
                onChange={(e) => onChange({ title: e.target.value })}
              />
            </label>
            <label>
              Título principal
              <input
                maxLength={FLOW_LIMITS.headline}
                value={node.headline ?? node.title}
                onChange={(e) => onChange({ headline: e.target.value })}
              />
            </label>
            <label>
              Descrição
              <textarea
                rows={4}
                maxLength={FLOW_LIMITS.description}
                value={node.descricao ?? ""}
                onChange={(e) => onChange({ descricao: e.target.value })}
              />
            </label>
            <label>
              Texto do botão principal
              <input
                maxLength={FLOW_LIMITS.buttonLabel}
                value={node.buttonLabel ?? ""}
                placeholder="Usar o nome da ligação"
                onChange={(e) => onChange({ buttonLabel: e.target.value })}
              />
            </label>
          </div>
          <p className={styles.notice}>
            As saídas definem os destinos; sem saídas, usamos as ligações do
            quadro. Textos são salvos automaticamente. Depois de preparar o ZIP,
            os arquivos também ficam na sua conta. O HTML importado mantém seu
            layout; os campos de texto acima são usados no conteúdo gerado pelo
            editor.
          </p>
          {error && <p role="alert">{error}</p>}
          {flow && (
            <PageExportPanel
              key={nodeId}
              flow={flow}
              page={flow.pages[0]}
              site={site}
              onSiteChange={onSiteChange}
              onPrepareZip={onPrepareZip}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
