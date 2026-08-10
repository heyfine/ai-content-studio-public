import { z } from "zod";

export const wordpressPublishSchema = z.object({
  articleId: z.string().min(1, "请选择文章"),
  configId: z.string().optional(),
  /** 发布到 WP 的状态：publish（公开发布）/ draft（草稿） */
  wpStatus: z.enum(["publish", "draft"]).optional(),
});

export type WordpressPublishValues = z.infer<typeof wordpressPublishSchema>;
