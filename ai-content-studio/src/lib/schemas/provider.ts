import { z } from "zod";

export const providerTypeEnum = z.enum(["OPENAI", "OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI"]);

// 基础对象（不含 refine），便于 updateProviderSchema 做 .partial()
const providerBase = z.object({
  name: z.string().min(1, "请输入名称"),
  type: providerTypeEnum,
  baseUrl: z.string().url("请输入合法 URL").optional().or(z.literal("")),
  apiKey: z.string().min(1, "请输入 API Key"),
  enabled: z.boolean().optional(),
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
export type UpdateProviderValues = z.infer<typeof updateProviderSchema>;
