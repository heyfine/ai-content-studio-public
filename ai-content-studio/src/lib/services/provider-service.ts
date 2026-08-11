import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAdapter, type AIProviderConfig } from "@/lib/ai";

export interface ProviderModelInput {
  name: string;
  displayName?: string;
}

export interface CreateProviderInput {
  name: string;
  type: "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";
  baseUrl?: string;
  apiKey: string;
  enabled?: boolean;
  models?: ProviderModelInput[];
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

/** 规整 model：displayName 为空时用 name 兜底（schema displayName 必填） */
function normalizeModels(models?: ProviderModelInput[]) {
  return (models ?? []).map((m) => ({ name: m.name, displayName: m.displayName || m.name }));
}

export async function createProvider(input: CreateProviderInput) {
  return prisma.aIProvider.create({
    data: {
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl || undefined,
      apiKey: encrypt(input.apiKey),
      enabled: input.enabled ?? true,
      models: { create: normalizeModels(input.models) },
    },
    include: { models: true },
  });
}

export async function updateProvider(id: string, input: Partial<CreateProviderInput>) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl || undefined;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.apiKey) data.apiKey = encrypt(input.apiKey);
  // 模型按 name 同步：删除多余的、新增缺失的、更新同名的 displayName；
  // 保留同名 model 的 id，避免误删 AITaskRoute 外键（onDelete: Cascade）。
  if (input.models !== undefined) {
    const existing = await prisma.aIModel.findMany({ where: { providerId: id } });
    const existingMap = new Map(existing.map((e) => [e.name, e]));
    const inputNames = new Set(input.models.map((m) => m.name));
    data.models = {
      deleteMany: {
        id: { in: existing.filter((e) => !inputNames.has(e.name)).map((e) => e.id) },
      },
      create: input.models
        .filter((m) => !existingMap.has(m.name))
        .map((m) => ({ name: m.name, displayName: m.displayName || m.name })),
      update: input.models
        .filter((m) => existingMap.has(m.name))
        .map((m) => ({
          where: { id: existingMap.get(m.name)?.id ?? "" },
          data: { displayName: m.displayName || m.name },
        })),
    };
  }
  return prisma.aIProvider.update({ where: { id }, data, include: { models: true } });
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

/** 用明文凭证拉取供应商可用模型列表（不读库，供「添加供应商」时现场获取） */
export async function fetchModels(config: AIProviderConfig): Promise<string[]> {
  if (config.type === "GEMINI") {
    throw new Error("Gemini 适配器将在后续 Phase 接入");
  }
  const adapter = getAdapter(config);
  return adapter.listModels();
}
