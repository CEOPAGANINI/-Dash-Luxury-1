import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/database/schema/index.ts",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // DIRECT_URL (conexão direta, porta 5432) para migrations;
    // fallback para DATABASE_URL em desenvolvimento local.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
