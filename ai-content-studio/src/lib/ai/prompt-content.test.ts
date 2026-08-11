import { describe, expect, it } from "vitest";
import {
  DE_AI_REVIEW_SYSTEM_PROMPT,
  NATURAL_WRITING_PROMPT_TEMPLATES,
  NATURAL_WRITING_SYSTEM_PROMPT,
} from "./prompt-content";

describe("prompt-content 去 AI 味模板", () => {
  it("两条系统提示词都不包含 {{占位符}}（运行时不做变量替换）", () => {
    for (const prompt of [NATURAL_WRITING_SYSTEM_PROMPT, DE_AI_REVIEW_SYSTEM_PROMPT]) {
      expect(prompt).not.toContain("{{");
      expect(prompt).not.toContain("}}");
    }
  });

  it("文章生成提示词包含关键规范段落", () => {
    for (const section of [
      "AI味控制",
      "不要凑字数",
      "事实与观点",
      "语言规范要点",
      "最终自检",
      "输出要求",
    ]) {
      expect(NATURAL_WRITING_SYSTEM_PROMPT).toContain(section);
    }
  });

  it("审校提示词包含关键审校段落", () => {
    for (const section of [
      "审校原则",
      "AI味检查",
      "事实检查",
      "来源边界",
      "修改策略",
      "待审校文章",
    ]) {
      expect(DE_AI_REVIEW_SYSTEM_PROMPT).toContain(section);
    }
  });

  it("模板清单与任务标识对齐，内容引用各自常量", () => {
    expect(NATURAL_WRITING_PROMPT_TEMPLATES).toHaveLength(2);
    const article = NATURAL_WRITING_PROMPT_TEMPLATES.find((t) => t.type === "article_generate");
    const review = NATURAL_WRITING_PROMPT_TEMPLATES.find((t) => t.type === "review");
    expect(article?.content).toBe(NATURAL_WRITING_SYSTEM_PROMPT);
    expect(review?.content).toBe(DE_AI_REVIEW_SYSTEM_PROMPT);
    expect(article?.name).toBe("文章生成·自然写作");
    expect(review?.name).toBe("AI审核·去AI味审校");
  });
});
