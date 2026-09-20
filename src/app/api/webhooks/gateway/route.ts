import { NextResponse } from "next/server";

/**
 * Webhook do gateway de pagamento.
 *
 * É este endereço que a página de Integrações manda cadastrar no painel do
 * gateway. Ele já aceita o aviso — assim o teste de webhook do gateway passa
 * e a fila deles não acumula erro — mas ainda não grava nada: o
 * processamento (validar a assinatura com o segredo, gravar o pagamento,
 * atualizar os painéis) entra junto com a sincronização de servidor.
 */
export async function POST(request: Request) {
  // Lê e descarta o corpo para o gateway receber um 200 limpo.
  await request.text().catch(() => "");

  return NextResponse.json({
    received: true,
    processed: false,
    reason: "A sincronização de servidor ainda não está ativa.",
  });
}

/** Alguns gateways testam o endereço com GET antes de salvar. */
export function GET() {
  return NextResponse.json({
    ok: true,
    hint: "Cadastre este endereço como webhook de pagamento no seu gateway.",
  });
}
