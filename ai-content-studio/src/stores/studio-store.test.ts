import { describe, it, expect, beforeEach } from "vitest";
import { useStudioStore, nextId } from "./studio-store";

const initial = {
  title: "",
  content: "",
  messages: [],
  generations: [],
  selectedTask: "article_generate",
  selectedPromptId: null,
  isGenerating: false,
  error: null,
  articleId: null,
  reasoningEnabled: false,
  reasoningEffort: "medium" as const,
  articleStatus: null,
};

describe("studio-store", () => {
  beforeEach(() => {
    useStudioStore.setState(initial);
  });

  it("setTitle/setContent 更新值", () => {
    useStudioStore.getState().setTitle("Hello");
    useStudioStore.getState().setContent("正文");
    expect(useStudioStore.getState().title).toBe("Hello");
    expect(useStudioStore.getState().content).toBe("正文");
  });

  it("appendMessage 追加消息到末尾", () => {
    useStudioStore.getState().appendMessage({ id: "1", role: "user", content: "hi" });
    useStudioStore.getState().appendMessage({ id: "2", role: "assistant", content: "ok" });
    expect(useStudioStore.getState().messages).toHaveLength(2);
    expect(useStudioStore.getState().messages[1].role).toBe("assistant");
  });

  it("appendDelta 按 id 累加增量，不影响其它消息", () => {
    useStudioStore.getState().appendMessage({ id: "1", role: "user", content: "hi" });
    useStudioStore.getState().appendMessage({ id: "2", role: "assistant", content: "" });
    useStudioStore.getState().appendDelta("2", "你");
    useStudioStore.getState().appendDelta("2", "好");
    const msgs = useStudioStore.getState().messages;
    expect(msgs[0].content).toBe("hi");
    expect(msgs[1].content).toBe("你好");
  });

  it("clearMessages 清空", () => {
    useStudioStore.getState().appendMessage({ id: "1", role: "user", content: "hi" });
    useStudioStore.getState().clearMessages();
    expect(useStudioStore.getState().messages).toHaveLength(0);
  });

  it("setSelectedTask 切换任务", () => {
    useStudioStore.getState().setSelectedTask("seo_analyze");
    expect(useStudioStore.getState().selectedTask).toBe("seo_analyze");
  });

  it("setSelectedPromptId 设置、可清 null", () => {
    useStudioStore.getState().setSelectedPromptId("p1");
    expect(useStudioStore.getState().selectedPromptId).toBe("p1");
    useStudioStore.getState().setSelectedPromptId(null);
    expect(useStudioStore.getState().selectedPromptId).toBeNull();
  });

  it("setGenerating/setError 控制状态", () => {
    useStudioStore.getState().setGenerating(true);
    useStudioStore.getState().setError("boom");
    expect(useStudioStore.getState().isGenerating).toBe(true);
    expect(useStudioStore.getState().error).toBe("boom");
  });

  it("setSavedArticle 设置 id 与 status", () => {
    useStudioStore.getState().setSavedArticle("a1", "DRAFT");
    expect(useStudioStore.getState().articleId).toBe("a1");
    expect(useStudioStore.getState().articleStatus).toBe("DRAFT");
  });

  it("setArticleStatus 更新状态", () => {
    useStudioStore.getState().setSavedArticle("a1", "DRAFT");
    useStudioStore.getState().setArticleStatus("REVIEW");
    expect(useStudioStore.getState().articleStatus).toBe("REVIEW");
    expect(useStudioStore.getState().articleId).toBe("a1");
  });

  it("resetArticle 清回未保存态", () => {
    useStudioStore.getState().setSavedArticle("a1", "PUBLISHED");
    useStudioStore.getState().resetArticle();
    expect(useStudioStore.getState().articleId).toBeNull();
    expect(useStudioStore.getState().articleStatus).toBeNull();
  });

  it("nextId 单调递增", () => {
    const a = nextId();
    const b = nextId();
    expect(a).not.toBe(b);
  });

  it("appendGeneration 追加生成条目并保留序号与时间", () => {
    useStudioStore.getState().appendGeneration({
      id: "g1",
      task: "article_generate",
      index: 1,
      content: "",
      createdAt: "14:32:05",
    });
    useStudioStore.getState().appendGeneration({
      id: "g2",
      task: "seo_analyze",
      index: 2,
      content: "",
      createdAt: "14:35:11",
    });
    const gs = useStudioStore.getState().generations;
    expect(gs).toHaveLength(2);
    expect(gs[1]).toMatchObject({ id: "g2", index: 2, createdAt: "14:35:11" });
  });

  it("appendGenerationDelta 按 id 累加生成内容，不影响其它条目", () => {
    useStudioStore.getState().appendGeneration({
      id: "g1",
      task: "article_generate",
      index: 1,
      content: "",
      createdAt: "14:32:05",
    });
    useStudioStore.getState().appendGenerationDelta("g1", "生成");
    useStudioStore.getState().appendGenerationDelta("g1", "正文");
    useStudioStore.getState().appendGenerationDelta("missing", "忽略");
    const gs = useStudioStore.getState().generations;
    expect(gs[0].content).toBe("生成正文");
    expect(gs).toHaveLength(1);
  });

  it("clearGenerations 清空", () => {
    useStudioStore.getState().appendGeneration({
      id: "g1",
      task: "article_generate",
      index: 1,
      content: "x",
      createdAt: "14:32:05",
    });
    useStudioStore.getState().clearGenerations();
    expect(useStudioStore.getState().generations).toEqual([]);
  });
});

describe("studio-store reasoning", () => {
  beforeEach(() => {
    useStudioStore.setState(initial);
  });
  it("默认深度思考关闭、强度为 medium", () => {
    expect(useStudioStore.getState().reasoningEnabled).toBe(false);
    expect(useStudioStore.getState().reasoningEffort).toBe("medium");
  });
  it("setReasoningEnabled/setReasoningEffort 更新值", () => {
    useStudioStore.getState().setReasoningEnabled(true);
    useStudioStore.getState().setReasoningEffort("high");
    expect(useStudioStore.getState().reasoningEnabled).toBe(true);
    expect(useStudioStore.getState().reasoningEffort).toBe("high");
  });
});
