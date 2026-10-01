import { NextResponse } from "next/server";

// The address shown in Integrations uses the same verified, retryable processor.
export { POST } from "../broski/route";

export function GET() {
  return NextResponse.json({
    ok: true,
    provider: "broski",
    signatureRequired: true,
    hint: "Cadastre este endereço no Broski. Outros gateways ainda não têm processamento habilitado.",
  });
}
