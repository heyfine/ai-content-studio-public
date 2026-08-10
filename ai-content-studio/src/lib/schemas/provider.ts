import { z } from "zod";

export const providerTypeEnum = z.enum(["OPENAI", "OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI"]);

export const createProviderSchema = z
  .object({
    name: z.string().min(1, "请输入名称"),
    type: providerTypeEnum,
    baseUrl: z.string().url("请输入合法 URL").optional().or(z.literal("")),
    apiKey: z.string().min(1, "请输入 API Key"),
    enabled: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.type !== "OPENAI_COMPATIBLE" || (typeof d.baseUrl === "string" && d.baseUrl.length > 0),
    { message: "OpenAI 兼容接口必须填写 Base URL", path: ["baseUrl"] },
  );

export const updateProviderSchema = createProviderSchema.partial();

export type CreateProviderValues = z.infer<typeof createProviderSchema>;
export type UpdateProviderValues = z.infer<typeof updateProviderSchema>;
