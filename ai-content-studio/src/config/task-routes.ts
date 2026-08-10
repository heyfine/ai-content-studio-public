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
];

export const taskRouteValues = taskRouteDefinitions.map((t) => t.value);
