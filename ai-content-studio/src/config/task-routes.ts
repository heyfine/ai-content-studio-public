export interface TaskRouteDefinition {
  /** 任务标识，拼写需与 AITaskRoute.task 一致 */
  value: string;
  label: string;
  description: string;
}

export const taskRouteDefinitions: TaskRouteDefinition[] = [
  { value: "article_generate", label: "文章生成", description: "生成文章正文" },
  { value: "outline_generate", label: "大纲生成", description: "生成文章大纲" },
  { value: "seo_analyze", label: "SEO 分析", description: "SEO 分析与建议" },
  { value: "title_generate", label: "标题生成", description: "为文章生成标题候选" },
  { value: "summary", label: "摘要生成", description: "生成内容摘要" },
  { value: "translate", label: "翻译", description: "多语言翻译" },
  { value: "seo_optimize", label: "SEO 优化", description: "基于 SEO 分析结果优化正文" },
  { value: "review", label: "AI 审核", description: "审核文章质量/事实/格式，给出通过/驳回意见" },
  {
    value: "layout_suggest",
    label: "AI 智能排版",
    description: "AI 排版建议（高亮/拆分/加粗/标题/引用/列表/移除高亮）",
  },
];

export const taskRouteValues = taskRouteDefinitions.map((t) => t.value);
