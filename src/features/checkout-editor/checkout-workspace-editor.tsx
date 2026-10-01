"use client";

import { useRef } from "react";
import { saveCheckoutConfigAction } from "@/features/checkouts/actions";
import { CheckoutEditor } from "./checkout-editor";
import type { CheckoutConfig } from "./checkout-config";

export function CheckoutWorkspaceEditor({
  id,
  name,
  config,
  revision,
}: {
  id: string;
  name: string;
  config: CheckoutConfig;
  revision: string;
}) {
  const currentRevision = useRef(revision);
  return (
    <CheckoutEditor
      inicial={config}
      nome={name}
      allowedMethods={["mbway", "multibanco"]}
      onSave={async (next) => {
        const result = await saveCheckoutConfigAction({
          checkoutId: id,
          config: next,
          revision: currentRevision.current,
        });
        if (result.ok && result.revision)
          currentRevision.current = result.revision;
        return result;
      }}
    />
  );
}
