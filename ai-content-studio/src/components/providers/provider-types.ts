import type { ProviderType } from "./provider-type-badge";

export type { ProviderType };

/** 列表页单行供应商（GET /api/providers 返回，apiKey 已脱敏） */
export interface ProviderRow {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string | null;
  enabled: boolean;
  models: { id: string; name: string; displayName: string }[];
}

/** 表单目标：有 id = 编辑；无 id = 新建（含复制渠道场景） */
export interface ProviderFormTarget {
  id?: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  enabled?: boolean;
  models: { name: string }[];
}

/** 单模型连通测试状态 */
export type ModelTestState =
  | { status: "running" }
  | { status: "ok"; latencyMs: number }
  | { status: "fail"; error: string };

/** 列表行整渠道连通测试进度 */
export interface ChannelTestProgress {
  total: number;
  done: number;
  results: Record<string, ModelTestState>;
}

/** 类型 → 表单 Base URL 占位提示 */
export const BASE_URL_HINTS: Record<ProviderType, string> = {
  OPENAI: "留空使用官方默认 https://api.openai.com",
  OPENAI_COMPATIBLE: "例如 https://api.deepseek.com",
  ANTHROPIC: "留空使用官方默认 https://api.anthropic.com",
  GEMINI: "留空使用官方默认",
};

/** 按行/逗号拆分模型文本，去空去重 */
export function parseModelsText(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
