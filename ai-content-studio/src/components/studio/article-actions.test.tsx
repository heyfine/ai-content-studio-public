import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { useStudioStore } from "@/stores/studio-store";
import { ArticleActions } from "./article-actions";

function resetStore(over: Partial<ReturnType<typeof useStudioStore.getState>> = {}) {
  useStudioStore.setState({
    title: "",
    content: "",
    messages: [],
    selectedTask: "article_generate",
    selectedPromptId: null,
    isGenerating: false,
    error: null,
    articleId: null,
    articleStatus: null,
    ...over,
  });
}

describe("ArticleActions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("未保存时显示「保存草稿」，无状态流程", () => {
    render(<ArticleActions />);
    expect(screen.getByTestId("save-article")).toHaveTextContent("保存草稿");
    expect(screen.queryByTestId("status-flow")).not.toBeInTheDocument();
  });

  it("标题为空时保存按钮禁用", () => {
    render(<ArticleActions />);
    expect(screen.getByTestId("save-article")).toBeDisabled();
  });

  it("保存草稿成功：POST /api/articles 后存 id+status 并提示已保存", async () => {
    resetStore({ title: "标题" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a1", status: "DRAFT" }) });
    render(<ArticleActions />);
    fireEvent.click(screen.getByTestId("save-article"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => {
      expect(useStudioStore.getState().articleId).toBe("a1");
      expect(useStudioStore.getState().articleStatus).toBe("DRAFT");
      expect(screen.getByTestId("saved-hint")).toHaveTextContent("已保存");
    });
  });

  it("已保存时改为「保存修改」并走 PUT /api/articles/:id", async () => {
    resetStore({ articleId: "a9", articleStatus: "DRAFT", title: "标题" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "a9", status: "DRAFT" }) });
    render(<ArticleActions />);
    expect(screen.getByTestId("save-article")).toHaveTextContent("保存修改");
    fireEvent.click(screen.getByTestId("save-article"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/a9",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("保存失败显示 error 进 store", async () => {
    resetStore({ title: "标题" });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "校验失败" }) });
    render(<ArticleActions />);
    fireEvent.click(screen.getByTestId("save-article"));
    await waitFor(() => expect(useStudioStore.getState().error).toBe("校验失败"));
  });

  it("已保存草稿显示状态流程，DRAFT→REVIEW 按钮可用", () => {
    resetStore({ articleId: "a1", articleStatus: "DRAFT" });
    render(<ArticleActions />);
    expect(screen.getByTestId("status-flow")).toBeInTheDocument();
    expect(screen.getByTestId("status-REVIEW")).not.toBeDisabled();
    expect(screen.getByTestId("status-DRAFT")).toBeDisabled();
  });

  it("PUBLISHED 状态下 DRAFT 可回，REVIEW 禁用（非法转换）", () => {
    resetStore({ articleId: "a1", articleStatus: "PUBLISHED" });
    render(<ArticleActions />);
    expect(screen.getByTestId("status-DRAFT")).not.toBeDisabled();
    expect(screen.getByTestId("status-REVIEW")).toBeDisabled();
  });

  it("状态切换成功：PUT status 后更新 store.articleStatus", async () => {
    resetStore({ articleId: "a1", articleStatus: "DRAFT" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "REVIEW" }) });
    render(<ArticleActions />);
    fireEvent.click(screen.getByTestId("status-REVIEW"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/articles/a1",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(useStudioStore.getState().articleStatus).toBe("REVIEW");
    });
  });

  it("状态切换失败（409 非法）显示 error", async () => {
    resetStore({ articleId: "a1", articleStatus: "DRAFT" });
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "非法状态转换：DRAFT → REVIEW" }),
    });
    render(<ArticleActions />);
    fireEvent.click(screen.getByTestId("status-REVIEW"));
    await waitFor(() => expect(useStudioStore.getState().error).toContain("非法状态转换"));
  });

  it("未保存时不渲染状态流程，显示占位提示", () => {
    render(<ArticleActions />);
    expect(screen.getByText(/尚未保存/)).toBeInTheDocument();
  });
});
