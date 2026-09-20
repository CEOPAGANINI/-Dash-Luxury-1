import { maskSecret, type ConnectionId } from "./connection-meta";

/**
 * Os campos que cada fonte pede, com o formato que cada valor precisa ter.
 *
 * O formulário valida com isto antes de enviar, e a ação do servidor valida
 * de novo com a mesma lista — o navegador ajuda, mas não é confiável.
 */
export interface FieldSpec {
  name: string;
  label: string;
  placeholder: string;
  /** Instrução curta de onde este valor mora na plataforma. */
  hint: string;
  /** Segredos vão criptografados para o banco e nunca voltam para a tela. */
  secret?: boolean;
  pattern: RegExp;
  /** O que dizer quando o valor não bate com o formato. */
  patternHint: string;
}

export const FIELDS: Partial<Record<ConnectionId, FieldSpec[]>> = {
  meta: [
    {
      name: "accountId",
      label: "ID da conta de anúncios",
      placeholder: "act_1234567890",
      hint: "Gerenciador de Anúncios → Configurações da conta. Começa com act_.",
      pattern: /^act_\d{5,20}$/,
      patternHint: "Use o formato act_ seguido dos números da conta.",
    },
    {
      name: "token",
      label: "Token de acesso (usuário do sistema)",
      placeholder: "EAAG…",
      hint: "business.facebook.com → Configurações do negócio → Usuários do sistema → Gerar token, com a permissão ads_read.",
      secret: true,
      pattern: /^\S{30,}$/,
      patternHint: "O token do Meta tem dezenas de caracteres, sem espaços.",
    },
  ],
  google: [
    {
      name: "customerId",
      label: "ID do cliente (Customer ID)",
      placeholder: "123-456-7890",
      hint: "Aparece no topo direito da conta do Google Ads.",
      pattern: /^\d{3}-\d{3}-\d{4}$/,
      patternHint: "Use o formato 000-000-0000, com os traços.",
    },
    {
      name: "developerToken",
      label: "Developer token",
      placeholder: "Ab1Cd2…",
      hint: "Google Ads → Ferramentas → Central de API.",
      secret: true,
      pattern: /^\S{10,}$/,
      patternHint:
        "O developer token tem pelo menos 10 caracteres, sem espaços.",
    },
    {
      name: "refreshToken",
      label: "Refresh token (OAuth)",
      placeholder: "1//0g…",
      hint: "Gerado no Google Cloud Console, no app OAuth com o escopo adwords.",
      secret: true,
      pattern: /^\S{20,}$/,
      patternHint: "O refresh token tem dezenas de caracteres, sem espaços.",
    },
  ],
  gateway: [
    {
      name: "gatewayName",
      label: "Qual gateway",
      placeholder: "Broski, Appmax, Pagar.me…",
      hint: "O nome do processador que recebe os pagamentos do checkout.",
      pattern: /^.{2,40}$/,
      patternHint: "Escreva o nome do gateway (2 a 40 caracteres).",
    },
    {
      name: "apiKey",
      label: "Chave de API",
      placeholder: "sk_live_…",
      hint: "Painel do gateway → Desenvolvedores → Chaves de API. Use a chave de leitura/secreta de produção.",
      secret: true,
      pattern: /^\S{16,}$/,
      patternHint: "A chave de API tem pelo menos 16 caracteres, sem espaços.",
    },
    {
      name: "webhookSecret",
      label: "Segredo do webhook",
      placeholder: "whsec_…",
      hint: "Criado ao cadastrar o webhook no gateway; valida que o aviso veio dele mesmo.",
      secret: true,
      pattern: /^\S{8,}$/,
      patternHint: "O segredo tem pelo menos 8 caracteres, sem espaços.",
    },
  ],
  shopify: [
    {
      name: "domain",
      label: "Domínio da loja",
      placeholder: "minha-loja.myshopify.com",
      hint: "O endereço .myshopify.com, não o domínio próprio.",
      pattern: /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i,
      patternHint: "Use o endereço completo terminando em .myshopify.com.",
    },
    {
      name: "adminToken",
      label: "Token Admin API",
      placeholder: "shpat_…",
      hint: "Admin da loja → Configurações → Apps e canais de vendas → Desenvolver apps → criar um app com o escopo read_orders → instalar → revelar o token.",
      secret: true,
      pattern: /^shpat_[a-zA-Z0-9]{16,}$/,
      patternHint: "O token Admin API começa com shpat_.",
    },
  ],
};

/** O identificador público que fica guardado, por fonte. */
export function identifierFrom(
  id: ConnectionId,
  values: Record<string, string>,
) {
  switch (id) {
    case "meta":
      return values.accountId?.trim() ?? "";
    case "google":
      return values.customerId?.trim() ?? "";
    case "gateway":
      return values.gatewayName?.trim() ?? "";
    case "shopify":
      return values.domain?.trim().toLowerCase() ?? "";
    default:
      return "";
  }
}

/** O primeiro campo secreto vira a máscara guardada. */
export function maskFrom(id: ConnectionId, values: Record<string, string>) {
  const secretField = FIELDS[id]?.find((field) => field.secret);
  return secretField ? maskSecret(values[secretField.name] ?? "") : "—";
}

/** Valida todos os campos; devolve os erros por nome (vazio = tudo certo). */
export function validateFields(
  id: ConnectionId,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of FIELDS[id] ?? []) {
    const value = (values[field.name] ?? "").trim();
    if (!value) errors[field.name] = "Preencha este campo.";
    else if (!field.pattern.test(value)) errors[field.name] = field.patternHint;
  }
  return errors;
}

/** Separa o que é segredo (vai criptografado) do que é público (vai no config). */
export function splitSecrets(
  id: ConnectionId,
  values: Record<string, string>,
): { secrets: Record<string, string>; publicValues: Record<string, string> } {
  const secrets: Record<string, string> = {};
  const publicValues: Record<string, string> = {};
  for (const field of FIELDS[id] ?? []) {
    const value = (values[field.name] ?? "").trim();
    if (field.secret) secrets[field.name] = value;
    else publicValues[field.name] = value;
  }
  return { secrets, publicValues };
}
