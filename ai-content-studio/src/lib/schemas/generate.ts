import { z } from "zod";

export const generateSchema = z.object({
  task: z.string().min(1, "请选择任务"),
  input: z.string().min(1, "请输入内容").max(8000, "输入过长"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
});

export type GenerateValues = z.infer<typeof generateSchema>;
