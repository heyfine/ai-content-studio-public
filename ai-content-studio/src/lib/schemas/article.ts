import { z } from "zod";

const statusEnum = z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);

export const createArticleSchema = z.object({
  title: z.string().min(1, "请输入标题"),
  slug: z.string().min(1).optional(),
  content: z.string().optional(),
  status: statusEnum.optional(),
  seoScore: z.number().int().optional(),
  wpPostId: z.string().optional(),
  promptId: z.string().optional(),
});

export const updateArticleSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  content: z.string().optional(),
  status: statusEnum.optional(),
  seoScore: z.number().int().nullable().optional(),
  wpPostId: z.string().nullable().optional(),
  promptId: z.string().nullable().optional(),
});

export type CreateArticleValues = z.infer<typeof createArticleSchema>;
export type UpdateArticleValues = z.infer<typeof updateArticleSchema>;
