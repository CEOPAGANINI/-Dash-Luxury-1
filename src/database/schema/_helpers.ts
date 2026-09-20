import { timestamp, uuid } from "drizzle-orm/pg-core";

/** ID seguro (UUID aleatório) — padrão em todas as tabelas */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** Auditoria temporal padrão */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

/** Soft delete opcional */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
