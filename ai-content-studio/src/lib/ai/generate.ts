import { prisma } from "@/lib/prisma";
import { generateByTask } from "./router";

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
 * 统一 AI 入口：业务层只调 AI.generate(...)，不关心底层 provider/model。
 * 成功后写入 AIGeneration 记录（含 token、耗时）。
 */
export async function generate(args: AIGenerateArgs): Promise<AIGenerateResult> {
  const start = Date.now();
  const { content, inputTokens, outputTokens, context } = await generateByTask(args);
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
