import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "./adapters";
import type { AIAdapter, AIProviderConfig, AIRequest, AIResponse, StreamMeta } from "./types";

export class NoRouteError extends Error {
  constructor(task: string) {
    super(`未配置任务路由：${task}`);
    this.name = "NoRouteError";
  }
}

export interface RouteContext {
  taskId: string;
  modelId: string;
  model: string;
  providerType: AIProviderConfig["type"];
}

export async function resolveRoute(task: string): Promise<{
  adapter: AIAdapter;
  model: string;
  context: RouteContext;
}> {
  const route = await prisma.aITaskRoute.findUnique({ where: { task } });
  if (!route) {
    throw new NoRouteError(task);
  }
  const model = await prisma.aIModel.findUnique({
    where: { id: route.modelId },
    include: { provider: true },
  });
  if (!model || !model.enabled) {
    throw new Error(`模型不可用：${route.modelId}`);
  }
  const providerConfig: AIProviderConfig = {
    type: model.provider.type,
    baseUrl: model.provider.baseUrl ?? undefined,
    apiKey: decrypt(model.provider.apiKey),
  };
  return {
    adapter: getAdapter(providerConfig),
    model: model.name,
    context: {
      taskId: route.id,
      modelId: model.id,
      model: model.name,
      providerType: model.provider.type,
    },
  };
}

export async function generateByTask(args: {
  task: string;
  input: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<{
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  context: RouteContext;
}> {
  const { adapter, model, context } = await resolveRoute(args.task);
  const messages = [
    ...(args.systemPrompt ? [{ role: "system" as const, content: args.systemPrompt }] : []),
    { role: "user" as const, content: args.input },
  ];
  const req: AIRequest = {
    model,
    messages,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    reasoningEffort: args.reasoningEffort,
  };
  const res: AIResponse = await adapter.generate(req);
  return {
    content: res.content,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    context,
  };
}

export async function* streamByTask(args: {
  task: string;
  input: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}): AsyncGenerator<
  string,
  { inputTokens?: number; outputTokens?: number; context: RouteContext },
  void
> {
  const { adapter, model, context } = await resolveRoute(args.task);
  const messages = [
    ...(args.systemPrompt ? [{ role: "system" as const, content: args.systemPrompt }] : []),
    { role: "user" as const, content: args.input },
  ];
  const req: AIRequest = {
    model,
    messages,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    reasoningEffort: args.reasoningEffort,
  };
  const gen = adapter.streamGenerate(req);
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  while (true) {
    const result = await gen.next();
    if (result.done) {
      inputTokens = result.value?.inputTokens;
      outputTokens = result.value?.outputTokens;
      break;
    }
    yield result.value;
  }
  return { inputTokens, outputTokens, context };
}
