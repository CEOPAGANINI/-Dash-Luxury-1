import { z } from "zod";

export const revenueDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.string().regex(/^\d{2}\/\d{2}$/),
  aprovada: z.number().finite().nonnegative(),
  pendente: z.number().finite().nonnegative(),
  recusada: z.number().finite().nonnegative(),
  pedidos: z.number().int().nonnegative(),
  tempoAprovacaoSeg: z.number().finite().nonnegative(),
});

export const dataFreshnessStatusSchema = z.object({
  source: z.enum(["checkout", "media", "crm", "costs"]),
  label: z.string().min(1),
  completeness: z.number().min(0).max(1),
  lastSuccessfulSync: z.string().datetime().nullable(),
  latencyMinutes: z.number().nonnegative().nullable(),
  status: z.enum(["healthy", "delayed", "estimated", "unavailable"]),
  note: z.string().min(1),
});

export const executiveAnalyticsDataSetSchema = z.object({
  revenueDays: z.array(revenueDaySchema),
  freshness: z.array(dataFreshnessStatusSchema),
  generatedAt: z.string().datetime(),
  demoMode: z.boolean(),
});

export type RevenueDayPayload = z.infer<typeof revenueDaySchema>;
