import { z } from "zod";

export const providerTypeEnum = z.enum(["OPENAI", "OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI"]);

/** 单个模型条目：name 必填，displayName 可选（空则用 name 兜底） */
export const modelItemSchema = z.object({
  name: z.string().min(1, "请输入模型名"),
  displayName: z.string().optional(),
});

// 基础对象（不含 refine），便于 updateProviderSchema 做 .partial()
const providerBase = z.object({
  name: z.string().min(1, "请输入名称"),
  type: providerTypeEnum,
  baseUrl: z.string().url("请输入合法 URL").optional().or(z.literal("")),
  apiKey: z.string().min(1, "请输入 API Key"),
  enabled: z.boolean().optional(),
  models: z.array(modelItemSchema).optional(),
});

const baseUrlRequired = (d: { type?: string; baseUrl?: string }) =>
  d.type !== "OPENAI_COMPATIBLE" || (typeof d.baseUrl === "string" && d.baseUrl.length > 0);

export const createProviderSchema = providerBase.refine(baseUrlRequired, {
  message: "OpenAI 兼容接口必须填写 Base URL",
  path: ["baseUrl"],
});

export const updateProviderSchema = providerBase.partial().refine(baseUrlRequired, {
  message: "OpenAI 兼容接口必须填写 Base URL",
  path: ["baseUrl"],
});

export type CreateProviderValues = z.infer<typeof createProviderSchema>;
export type CreateProviderInputValues = z.input<typeof createProviderSchema>;
export type UpdateProviderValues = z.infer<typeof updateProviderSchema>;
export type ModelItem = z.infer<typeof modelItemSchema>;
