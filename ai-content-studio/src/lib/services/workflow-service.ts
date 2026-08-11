import { prisma } from "@/lib/prisma";
import { generate as aiGenerate } from "@/lib/ai/generate";
import { analyzeRaw } from "@/lib/services/seo-service";
import { publishArticle } from "@/lib/services/wordpress-service";
import { createArticle, updateArticle, slugify } from "@/lib/services/article-service";
import {
  WORKFLOW_STEPS,
  buildOutlineInput,
  buildWriteInput,
  buildReviewInput,
  parseReviewVerdict,
  type StepDef,
  type StepOutput,
  type WorkflowContext,
} from "@/lib/workflow/workflow-steps";
import { runWorkflow as runEngine, type WorkflowResult } from "@/lib/workflow/workflow-engine";

export interface RunWorkflowOptions {
  /** 发布到该 WordPress 配置；不传则用首个启用配置 */
  configId?: string;
  /** 复用指定 Prompt 模板（覆盖 active 模板） */
  promptId?: string;
  /** 发布到 WP 的状态，默认 draft（避免误公开未审内容） */
  wpStatus?: "publish" | "draft";
}

export interface RunWorkflowReturn {
  run: {
    id: string;
    topic: string;
    status: string;
    steps: unknown;
    articleId: string | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  result: WorkflowResult;
}

interface RunState {
  articleId?: string;
  configId?: string;
  promptId?: string;
  wpStatus: "publish" | "draft";
}

function buildAiInput(step: StepDef, ctx: WorkflowContext): string {
  if (step.id === "outline") return buildOutlineInput(ctx);
  if (step.id === "write") return buildWriteInput(ctx);
  if (step.id === "review") return buildReviewInput(ctx);
  return ctx.topic;
}

async function executeStep(
  step: StepDef,
  ctx: WorkflowContext,
  state: RunState,
): Promise<StepOutput> {
  if (step.kind === "ai") {
    const input = buildAiInput(step, ctx);
    const res = await aiGenerate({
      task: step.task ?? step.id,
      input,
      articleId: state.articleId,
      promptId: state.promptId,
    });
    if (step.id === "write") {
      const slug = `${slugify(ctx.topic)}-${Date.now().toString(36)}`;
      const article = await createArticle({
        title: ctx.topic,
        slug,
        content: res.content,
        status: "DRAFT",
      });
      state.articleId = article.id;
      return {
        status: "success",
        content: res.content,
        generationId: res.generationId,
        data: { articleId: article.id },
      };
    }
    if (step.id === "review") {
      const { verdict, comment } = parseReviewVerdict(res.content);
      if (verdict === "fail") {
        return {
          status: "failed",
          content: res.content,
          generationId: res.generationId,
          error: `审核驳回：${comment.slice(0, 200)}`,
        };
      }
      if (state.articleId) {
        await updateArticle(state.articleId, { status: "REVIEW" });
      }
      return {
        status: "success",
        content: res.content,
        generationId: res.generationId,
        data: { verdict: "pass" },
      };
    }
    return { status: "success", content: res.content, generationId: res.generationId };
  }

  if (step.kind === "seo") {
    const writeOut = ctx.outputs.write;
    if (!writeOut?.content) {
      return { status: "skipped", error: "缺少正文，跳过 SEO 分析" };
    }
    const r = await analyzeRaw({ title: ctx.topic, content: writeOut.content });
    return {
      status: "success",
      content: "",
      data: {
        score: r.score,
        keywords: r.keywords,
        issues: r.issues,
        suggestions: r.suggestions,
      },
    };
  }

  if (step.kind === "publish") {
    if (!state.articleId) {
      return { status: "failed", error: "无 articleId，无法发布" };
    }
    const pub = await publishArticle(state.articleId, state.configId, state.wpStatus);
    await updateArticle(state.articleId, { status: "PUBLISHED" });
    return {
      status: "success",
      content: "",
      data: { wpPostId: pub.wpPostId, link: pub.link, wpStatus: pub.status },
    };
  }

  return { status: "failed", error: `未知步骤类型：${step.kind}` };
}

function failedStepError(result: WorkflowResult): string | undefined {
  const failed = result.steps.find(
    (s) => s.output.status === "failed" && !!s.output.error && !s.output.error.includes("已跳过"),
  );
  return failed?.output.error;
}

export async function runWorkflow(
  topic: string,
  opts: RunWorkflowOptions = {},
): Promise<RunWorkflowReturn> {
  const wpStatus = opts.wpStatus ?? "draft";
  const run = await prisma.workflowRun.create({
    data: { topic, status: "RUNNING", steps: JSON.parse("[]") },
  });

  const state: RunState = {
    configId: opts.configId,
    promptId: opts.promptId,
    wpStatus,
  };

  const result = await runEngine(WORKFLOW_STEPS, topic, {
    executeStep: (step, ctx) => executeStep(step, ctx, state),
  });

  const stepsSnapshot = result.steps.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.output.status,
    content: s.output.content,
    data: s.output.data,
    error: s.output.error,
    durationMs: s.output.durationMs,
  }));
  // Prisma Json 字段需 InputJsonValue；数组直推不兼容，转纯 JSON 值
  const stepsValue = JSON.parse(JSON.stringify(stepsSnapshot));

  if (result.status === "success") {
    const updated = await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        steps: stepsValue,
        articleId: state.articleId ?? null,
        configId: opts.configId ?? null,
        finishedAt: new Date(),
      },
    });
    return { run: updated, result };
  }

  const updated = await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: "FAILED",
      steps: stepsValue,
      articleId: state.articleId ?? null,
      error: failedStepError(result) ?? result.reason ?? "未知错误",
      finishedAt: new Date(),
    },
  });
  return { run: updated, result };
}

export async function listWorkflowRuns() {
  return prisma.workflowRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
}

export async function getWorkflowRun(id: string) {
  return prisma.workflowRun.findUnique({ where: { id } });
}
