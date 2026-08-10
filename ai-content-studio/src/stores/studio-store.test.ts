import { describe, it, expect, beforeEach } from "vitest";
import { useStudioStore, nextId } from "./studio-store";

const initial = {
  title: "",
  content: "",
  messages: [],
  selectedTask: "article_generate",
  selectedPromptId: null,
  isGenerating: false,
  error: null,
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

  it("nextId 单调递增", () => {
    const a = nextId();
    const b = nextId();
    expect(a).not.toBe(b);
  });
});
