import { prisma } from "@/lib/prisma";
import { getPrompt, getActivePromptByType } from "@/lib/services/prompt-service";
import { generateByTask, streamByTask } from "./router";

export interface AIGenerateArgs {
  task: string;
  input: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** 可选，关联到的文章（Phase 3） */
  articleId?: string;
  /** 可选，使用的 Prompt 模板 id */
  promptId?: string;
}

export interface AIGenerateResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  modelId: string;
  /** 生成记录 id */
  generationId: string;
}

/**
 * 解析 systemPrompt：显式传入 > promptId 对应模板 > 任务类型下 active 模板。
 * 打通「Prompt 模板 → AI 调用」链路。
 */
async function resolveSystemPrompt(args: AIGenerateArgs): Promise<string | undefined> {
  if (args.systemPrompt) return args.systemPrompt;
  if (args.promptId) {
    const prompt = await getPrompt(args.promptId);
    if (prompt) return prompt.content;
  }
  const active = await getActivePromptByType(args.task);
  return active?.content;
}

/**
 * 统一 AI 入口：业务层只调 AI.generate(...)，不关心底层 provider/model。
 * 成功后写入 AIGeneration 记录（含 token、耗时）。
 */
export async function generate(args: AIGenerateArgs): Promise<AIGenerateResult> {
  const start = Date.now();
  const systemPrompt = await resolveSystemPrompt(args);
  const { content, inputTokens, outputTokens, context } = await generateByTask({
    task: args.task,
    input: args.input,
    systemPrompt,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
  });
  const duration = Date.now() - start;

  const record = await prisma.aIGeneration.create({
    data: {
      articleId: args.articleId,
      modelId: context.modelId,
      promptId: args.promptId,
      input: args.input,
      output: content,
      inputTokens,
      outputTokens,
      duration,
    },
  });

  return {
    content,
    inputTokens,
    outputTokens,
    modelId: context.modelId,
    generationId: record.id,
  };
}

/**
 * 流式生成：逐个 yield 文本增量；结束后写入 AIGeneration 记录并 return 结果。
 * 供 /api/ai/stream 调用。
 */
export async function* generateStream(
  args: AIGenerateArgs,
): AsyncGenerator<string, AIGenerateResult, void> {
  const start = Date.now();
  const systemPrompt = await resolveSystemPrompt(args);
  const gen = streamByTask({
    task: args.task,
    input: args.input,
    systemPrompt,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
  });
  let content = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let modelId = "";
  while (true) {
    const result = await gen.next();
    if (result.done) {
      inputTokens = result.value?.inputTokens;
      outputTokens = result.value?.outputTokens;
      modelId = result.value?.context.modelId ?? "";
      break;
    }
    content += result.value;
    yield result.value;
  }
  const duration = Date.now() - start;
  const record = await prisma.aIGeneration.create({
    data: {
      articleId: args.articleId,
      modelId,
      promptId: args.promptId,
      input: args.input,
      output: content,
      inputTokens,
      outputTokens,
      duration,
    },
  });
  return { content, inputTokens, outputTokens, modelId, generationId: record.id };
}
