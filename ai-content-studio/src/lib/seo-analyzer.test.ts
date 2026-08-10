import { describe, it, expect } from "vitest";
import { analyzeSeo } from "./seo-analyzer";

const GOOD = {
  title: "Next.js 16 部署到 Vercel 的完整指南",
  content: `## 概述
本文介绍如何把 Next.js 16 应用部署到 Vercel 平台，涵盖环境变量、构建与 API 路由。

部署前请准备 [Vercel 账号](https://vercel.com) 与已就绪的项目仓库。

## 配置环境变量
在 Vercel 后台设置 \`DATABASE_URL\` 等环境变量，参考 [环境变量文档](https://vercel.com/docs)。

![部署流程图](/deploy.png)

## 注意事项
- 确认 Node 运行时版本
- 检查 API 路由区域设置
- 开启 ISR 缓存策略`,
  metaDescription:
    "本指南详解 Next.js 16 应用部署到 Vercel 的完整流程，含环境变量配置、API 路由区域、构建与缓存策略，帮助你稳定上线。",
};

describe("analyzeSeo", () => {
  it("优质文章得高分且无致命 issues", () => {
    const r = analyzeSeo(GOOD);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.keywords.length).toBeGreaterThan(0);
  });

  it("score 限制在 0-100", () => {
    const r = analyzeSeo({ title: "", content: "" });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("标题为空扣分并报 issues", () => {
    const r = analyzeSeo({ ...GOOD, title: "" });
    expect(r.issues).toContain("缺少标题");
    expect(r.score).toBeLessThan(90);
  });

  it("标题过短", () => {
    const r = analyzeSeo({ ...GOOD, title: "简" });
    expect(r.issues.some((i) => i.includes("标题过短"))).toBe(true);
  });

  it("标题过长", () => {
    const r = analyzeSeo({ ...GOOD, title: "x".repeat(70) });
    expect(r.issues.some((i) => i.includes("标题过长"))).toBe(true);
  });

  it("无标题层级扣分", () => {
    const r = analyzeSeo({ ...GOOD, content: "一段没有标题的纯文本，且足够让正文长度达标。" });
    expect(r.issues.some((i) => i.includes("缺少标题层级"))).toBe(true);
  });

  it("多个 H1 报警", () => {
    const r = analyzeSeo({ ...GOOD, content: "# H1甲\n# H1乙\n## 概述\n正文。" });
    expect(r.issues.some((i) => i.includes("多个 H1"))).toBe(true);
  });

  it("图片缺 ALT 扣分", () => {
    const r = analyzeSeo({ ...GOOD, content: `## 概述\n正文。\n![](/no-alt.png)` });
    expect(r.issues.some((i) => i.includes("缺少 ALT"))).toBe(true);
  });

  it("无内部链接扣分并给建议", () => {
    const r = analyzeSeo({
      ...GOOD,
      content: `## 概述\n一段足够长的正文，没有任何链接存在这里。`.padEnd(220, "。"),
    });
    expect(r.issues).toContain("缺少内部链接");
    expect(r.suggestions.some((s) => s.includes("内部链接"))).toBe(true);
  });

  it("缺少 Meta 描述给建议", () => {
    const r = analyzeSeo({ title: GOOD.title, content: GOOD.content });
    expect(r.issues).toContain("缺少 Meta 描述");
    expect(r.suggestions.some((s) => s.includes("Meta 描述"))).toBe(true);
  });

  it("Meta 描述过长", () => {
    const r = analyzeSeo({ ...GOOD, metaDescription: "m".repeat(200) });
    expect(r.issues.some((i) => i.includes("Meta 描述过长"))).toBe(true);
  });

  it("正文过短扣分", () => {
    const r = analyzeSeo({ ...GOOD, content: "## 概述\n短。" });
    expect(r.issues.some((i) => i.includes("正文偏短"))).toBe(true);
  });

  it("长段落扣分并给拆分建议", () => {
    const long = "x".repeat(250);
    const r = analyzeSeo({ ...GOOD, content: `## 概述\n${long}` });
    expect(r.issues.some((i) => i.includes("段落过长"))).toBe(true);
    expect(r.suggestions.some((s) => s.includes("拆分"))).toBe(true);
  });

  it("关键词提取包含英文与去停用词", () => {
    const r = analyzeSeo({
      title: "React performance tips",
      content: "## React hooks\nuse memo in react components.\nthe and of.",
    });
    expect(r.keywords).toContain("react");
    expect(r.keywords).not.toContain("the");
    expect(r.keywords).not.toContain("and");
    expect(r.keywords.length).toBeLessThanOrEqual(5);
  });

  it("无有效关键词扣分", () => {
    const r = analyzeSeo({ title: "的", content: "the and of" });
    expect(r.issues.some((i) => i.includes("有效关键词"))).toBe(true);
  });
});
