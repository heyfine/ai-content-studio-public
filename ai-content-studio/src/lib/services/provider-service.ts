import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAdapter, type AIProviderConfig } from "@/lib/ai";

export interface CreateProviderInput {
  name: string;
  type: "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";
  baseUrl?: string;
  apiKey: string;
  enabled?: boolean;
}

export function toProviderConfig(row: {
  type: string;
  baseUrl: string | null;
  apiKey: string;
}): AIProviderConfig {
  return {
    type: row.type as AIProviderConfig["type"],
    baseUrl: row.baseUrl ?? undefined,
    apiKey: decrypt(row.apiKey),
  };
}

type ProviderWithModels = Awaited<ReturnType<typeof prisma.aIProvider.findMany>>[number];

function maskProvider(r: ProviderWithModels) {
  return { ...r, apiKey: r.apiKey ? "[encrypted]" : "" };
}

export async function listProviders() {
  const rows = await prisma.aIProvider.findMany({ include: { models: true } });
  return rows.map(maskProvider);
}

export async function getProvider(id: string) {
  return prisma.aIProvider.findUnique({ where: { id }, include: { models: true } });
}

export async function createProvider(input: CreateProviderInput) {
  return prisma.aIProvider.create({
    data: {
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl,
      apiKey: encrypt(input.apiKey),
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateProvider(id: string, input: Partial<CreateProviderInput>) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.apiKey) data.apiKey = encrypt(input.apiKey);
  return prisma.aIProvider.update({ where: { id }, data });
}

export async function deleteProvider(id: string) {
  return prisma.aIProvider.delete({ where: { id } });
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs?: number;
  models?: string[];
  error?: string;
}

/** 测试连接：列举可用模型，返回延迟与模型列表 */
export async function testConnection(id: string): Promise<TestConnectionResult> {
  const row = await prisma.aIProvider.findUnique({ where: { id } });
  if (!row) {
    return { success: false, error: "供应商不存在" };
  }
  if (row.type === "GEMINI") {
    return { success: false, error: "Gemini 适配器将在后续 Phase 接入" };
  }
  const start = Date.now();
  try {
    const adapter = getAdapter(toProviderConfig(row));
    const models = await adapter.listModels();
    return { success: true, latencyMs: Date.now() - start, models };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
