/**
 * Resolve a URL pública da aplicação.
 *
 * Ordem de prioridade:
 * 1. NEXT_PUBLIC_APP_URL — override explícito (ex.: domínio próprio)
 * 2. VERCEL_PROJECT_PRODUCTION_URL — domínio estável de produção (Vercel)
 * 3. VERCEL_URL — URL específica do deploy (previews)
 * 4. localhost — desenvolvimento
 *
 * Evita depender de configuração manual: ao trocar de domínio, a aplicação
 * continua enviando a URL correta ao gateway sem precisar editar variáveis.
 */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && !explicit.includes("localhost")) {
    return explicit.replace(/\/$/, "");
  }

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;

  const deploymentUrl = process.env.VERCEL_URL;
  if (deploymentUrl) return `https://${deploymentUrl}`;

  return explicit?.replace(/\/$/, "") ?? "http://localhost:3000";
}
