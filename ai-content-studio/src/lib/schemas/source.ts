import { z } from "zod";

/**
 * Source Crawler 入参/筛选 schema。与 prisma 无强耦合，便于在 schema 让渡前就写好并单测。
 */

export const createSourceSchema = z.object({
  url: z.string().min(1, "请输入 URL").url("URL 格式不合法"),
});

export const fetchStatusSchema = z.enum([
  "pending",
  "fetching",
  "fetched",
  "parsed",
  "failed",
  "blocked",
  "requires_access",
]);

export const listSourcesSchema = z.object({
  domain: z.string().min(1).optional(),
  status: fetchStatusSchema.optional(),
});

export const sourceIdSchema = z.object({
  id: z.string().min(1, "缺少 id"),
});

export type CreateSourceValues = z.infer<typeof createSourceSchema>;
export type ListSourcesValues = z.infer<typeof listSourcesSchema>;
export type SourceIdValues = z.infer<typeof sourceIdSchema>;
