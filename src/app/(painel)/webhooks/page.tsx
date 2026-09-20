import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Webhooks" };

export default function WebhooksPage() {
  return (
    <ModulePlaceholder
      title="Webhooks"
      description="Webhooks recebidos e enviados com verificação de assinatura, idempotência, novas tentativas com backoff, dead-letter e payloads mascarados."
      phase={4}
    />
  );
}
