/**
 * Schema completo da plataforma (Drizzle ORM + PostgreSQL/Supabase).
 * Todas as entidades de negócio possuem workspace_id (multi-tenant + RLS).
 * As tabelas vps_* não guardam credencial: só hashes e parâmetros assinados.
 */
export * from "./enums";
export * from "./workspaces";
export * from "./stores";
export * from "./catalog";
export * from "./pages";
export * from "./checkouts";
export * from "./customers";
export * from "./carts";
export * from "./orders";
export * from "./payments";
export * from "./analytics";
export * from "./pixels";
export * from "./integrations";
export * from "./emails";
export * from "./notifications";
export * from "./system";
export * from "./executive-analytics";
export * from "./ads";
export * from "./vps";
