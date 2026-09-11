import { z } from "zod";

/**
 * AI 输入字符上限，前后端共用（前端排版预检 import 同一常量，防两端漂移）。
 * 「AI 智能排版」把整篇文章（含表格序列化的内嵌 HTML）作为 input 发送，
 * 原 8000 上限对带样式表格的长文必然触发 400「校验失败」（2026-09-11 实测），
 * 放宽到 60000：仍可拦截误用/超大请求，远低于主流模型上下文的安全余量。
 */
export const GENERATE_INPUT_MAX = 60000;

export const generateSchema = z.object({
  task: z.string().min(1, "请选择任务"),
  input: z
    .string()
    .min(1, "请输入内容")
    .max(GENERATE_INPUT_MAX, `输入过长（上限 ${GENERATE_INPUT_MAX} 字符）`),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
  promptId: z.string().optional(),
  articleId: z.string().optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
});

export type GenerateValues = z.infer<typeof generateSchema>;
