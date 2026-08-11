/**
 * Workflow 步骤定义（纯数据 + 纯函数，零外部依赖，100% 可单测）。
 *
 * 固定 6 步内容生产流程：选题→大纲→写作→SEO→审核→发布。
 * 本文件只定义步骤的「形状」与各步 input 的拼装纯函数（inputBuilder），
 * 不执行 AI / 不访问 DB / 不发 fetch —— 实际执行由 workflow-engine 注入的
 * executeStep 回调承担，使编排逻辑可 100% mock 测试。
 */

export const WORKFLOW_TYPE = "article_v1" as const;

export type StepKind = "ai" | "seo" | "publish";

export interface StepDef {
  id: string;
  name: string;
  kind: StepKind;
  /** AI 步调用的任务路由（与 AITaskRoute.task 对齐） */
  task?: string;
  /** 该步是否可选（可选步失败不短路后续） */
  optional?: boolean;
}

export const WORKFLOW_STEPS: StepDef[] = [
  { id: "outline", name: "选题/大纲", kind: "ai", task: "outline_generate" },
  { id: "write", name: "写作", kind: "ai", task: "article_generate" },
  { id: "seo", name: "SEO 分析", kind: "seo", optional: true },
  { id: "review", name: "AI 审核", kind: "ai", task: "review" },
  { id: "publish", name: "发布 WordPress", kind: "publish", optional: true },
];

export type StepStatus = "success" | "skipped" | "failed";

export interface StepOutput {
  status: StepStatus;
  /** 文本产出（AI 步为生成正文，SEO 步无） */
  content?: string;
  /** 结构化结果（SEO 步 score/keywords 等，publish 步 wpPostId/link） */
  data?: Record<string, unknown>;
  /** AI generationId（仅 AI 步） */
  generationId?: string;
  durationMs?: number;
  error?: string;
}

export interface WorkflowContext {
  topic: string;
  outputs: Record<string, StepOutput>;
}

/** 大纲步 input：仅需主题 */
export function buildOutlineInput(ctx: WorkflowContext): string {
  return `主题：${ctx.topic}`;
}

/** 写作步 input：主题 + 大纲产出 */
export function buildWriteInput(ctx: WorkflowContext): string {
  const outline = ctx.outputs.outline?.content?.trim();
  if (!outline) throw new Error("缺少大纲产出，无法执行写作步");
  return `主题：${ctx.topic}\n\n大纲：\n${outline}`;
}

/** 审核步 input：正文 + SEO 评分与问题（SEO 步产出） */
export function buildReviewInput(ctx: WorkflowContext): string {
  const content = ctx.outputs.write?.content?.trim();
  if (!content) throw new Error("缺少正文产出，无法执行审核步");
  const seo = ctx.outputs.seo?.data as { score?: number; issues?: string[] } | undefined;
  const seoSummary = seo
    ? `SEO 评分：${seo.score ?? "?"}；问题：${(seo.issues ?? []).join("；") || "无"}`
    : "未做 SEO 分析";
  return `请审核以下文章的质量、事实准确性、格式与重复度，给出通过(pass)/驳回(fail)结论与意见。\n\n${seoSummary}\n\n正文：\n${content}`;
}

/** 从审核步产出文本解析结论：pass / fail（容错，默认 pass） */
export function parseReviewVerdict(content: string): { verdict: "pass" | "fail"; comment: string } {
  const text = content.trim();
  const fail = /\bfail\b/i.test(text) || /(驳回|不通过|不达标)/.test(text);
  return { verdict: fail ? "fail" : "pass", comment: text };
}

/** 工作步骤 id 列表（便于全量校验） */
export const WORKFLOW_STEP_IDS = WORKFLOW_STEPS.map((s) => s.id);
