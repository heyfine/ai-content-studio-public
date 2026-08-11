import { z } from "zod";

export const workflowRunSchema = z.object({
  topic: z.string().min(1, "请输入主题"),
  configId: z.string().optional(),
  promptId: z.string().optional(),
  /** 发布到 WP 的状态，默认 draft（避免误公开未审内容） */
  wpStatus: z.enum(["publish", "draft"]).optional(),
});

export type WorkflowRunValues = z.infer<typeof workflowRunSchema>;
