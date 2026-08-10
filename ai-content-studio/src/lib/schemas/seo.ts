import { z } from "zod";

export const seoAnalyzeSchema = z
  .object({
    articleId: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    metaDescription: z.string().optional(),
  })
  .refine((d) => !!d.articleId || (!!d.title && d.content !== undefined), {
    message: "需提供 articleId 或 title+content",
  });

export type SeoAnalyzeValues = z.infer<typeof seoAnalyzeSchema>;
