import { z } from "zod";

export const createPromptSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  description: z.string().optional().or(z.literal("")),
  type: z.string().min(1, "请选择类型"),
  content: z.string().min(1, "请输入 Prompt 内容"),
  active: z.boolean().optional(),
});

export const updatePromptSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().or(z.literal("")).optional(),
  type: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export type CreatePromptValues = z.infer<typeof createPromptSchema>;
export type UpdatePromptValues = z.infer<typeof updatePromptSchema>;
