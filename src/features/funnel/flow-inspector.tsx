"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";

/** Desktop panels remain part of the board. Small screens trap focus in the full-screen inspector. */
export function FlowInspector({
  fullScreen,
  label,
  onClose,
  children,
}: {
  fullScreen: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const returnFocus = React.useRef<HTMLElement | null>(null);
  if (!fullScreen) return children;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        className="flow-inspector"
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <Dialog.Title className="sr-only">{label}</Dialog.Title>
        <Dialog.Description className="sr-only">
          Edite a etapa do funil. Pressione Escape ou use o botão Fechar para
          voltar ao quadro.
        </Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
