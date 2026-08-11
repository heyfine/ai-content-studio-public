import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { WorkflowClient } from "./workflow-client";

function historyPayload(): unknown[] {
  return [
    {
      id: "h1",
      topic: "旧主题",
      status: "SUCCEEDED",
      articleId: "a0",
      error: null,
      createdAt: "2026-08-11T03:00:00.000Z",
    },
  ];
}

function successRunPayload(): unknown {
  return {
    run: {
      id: "r1",
      topic: "Next.js 16",
      status: "SUCCEEDED",
      articleId: "a1",
      error: null,
      steps: [],
    },
    result: {
      status: "success",
      steps: [
        { id: "outline", name: "选题/大纲", output: { status: "success", content: "大纲" } },
        { id: "write", name: "写作", output: { status: "success", content: "正文" } },
        { id: "seo", name: "SEO 分析", output: { status: "success", data: { score: 78 } } },
        { id: "review", name: "AI 审核", output: { status: "success", data: { verdict: "pass" } } },
        {
          id: "publish",
          name: "发布 WordPress",
          output: { status: "success", data: { wpPostId: "12", link: "https://blog/?p=12" } },
        },
      ],
    },
  };
}

function failedRunPayload(): unknown {
  return {
    run: {
      id: "r2",
      topic: "T",
      status: "FAILED",
      articleId: "a1",
      error: "审核驳回：质量差，事实有误",
      steps: [],
    },
    result: {
      status: "failed",
      reason: "step_failed:review",
      steps: [
        { id: "outline", name: "选题/大纲", output: { status: "success" } },
        { id: "write", name: "写作", output: { status: "success" } },
        { id: "seo", name: "SEO 分析", output: { status: "success" } },
        { id: "review", name: "AI 审核", output: { status: "failed", error: "审核驳回：质量差" } },
        { id: "publish", name: "发布 WordPress", output: { status: "skipped" } },
      ],
    },
  };
}

describe("WorkflowClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it("渲染输入与运行按钮，默认草稿模式", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<WorkflowClient />);
    expect(screen.getByText("AI 内容工作流")).toBeInTheDocument();
    expect(screen.getByTestId("wf-run")).toBeInTheDocument();
    expect(screen.getByText("草稿（推荐）")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("wf-no-history")).toBeInTheDocument());
  });

  it("输入主题运行成功，显示 5 步状态、SEO 评分与发布链接", async () => {
    let runCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/workflows" && (init?.method ?? "GET") === "GET") {
        return runCalled
          ? { ok: true, json: async () => historyPayload() }
          : { ok: true, json: async () => [] };
      }
      if (url === "/api/workflows/run" && init?.method === "POST") {
        runCalled = true;
        return { ok: true, json: async () => successRunPayload() };
      }
      return { ok: true, json: async () => [] };
    });
    render(<WorkflowClient />);
    await waitFor(() => expect(screen.getByTestId("wf-no-history")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("主题"), { target: { value: "Next.js 16" } });
    fireEvent.click(screen.getByTestId("wf-run"));
    await waitFor(() => expect(screen.getByTestId("wf-result")).toBeInTheDocument());
    expect(screen.getByTestId("wf-step-outline")).toBeInTheDocument();
    expect(screen.getByText("· 评分 78")).toBeInTheDocument();
    expect(screen.getByTestId("wf-step-link")).toHaveAttribute("href", "https://blog/?p=12");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workflows/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("审核驳回运行：显示失败与 error", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/workflows" && (init?.method ?? "GET") === "GET")
        return { ok: true, json: async () => [] };
      if (url === "/api/workflows/run" && init?.method === "POST")
        return { ok: true, json: async () => failedRunPayload() };
      return { ok: true, json: async () => [] };
    });
    render(<WorkflowClient />);
    await waitFor(() => expect(screen.getByTestId("wf-no-history")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("主题"), { target: { value: "T" } });
    fireEvent.click(screen.getByTestId("wf-run"));
    await waitFor(() => expect(screen.getByTestId("wf-run-error")).toHaveTextContent("审核驳回"));
  });

  it("API 失败显示 alert", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/workflows" && (init?.method ?? "GET") === "GET")
        return { ok: true, json: async () => [] };
      if (url === "/api/workflows/run" && init?.method === "POST")
        return { ok: false, json: async () => ({ error: "工作流执行失败" }) };
      return { ok: true, json: async () => [] };
    });
    render(<WorkflowClient />);
    await waitFor(() => expect(screen.getByTestId("wf-no-history")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("主题"), { target: { value: "T" } });
    fireEvent.click(screen.getByTestId("wf-run"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("工作流执行失败"));
  });

  it("历史列表渲染", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/workflows" && (init?.method ?? "GET") === "GET")
        return { ok: true, json: async () => historyPayload() };
      return { ok: true, json: async () => [] };
    });
    render(<WorkflowClient />);
    await waitFor(() => expect(screen.getByTestId("wf-history")).toBeInTheDocument());
    expect(screen.getByText("旧主题")).toBeInTheDocument();
    expect(screen.getByText(/成功/)).toBeInTheDocument();
  });

  it("空主题运行按钮禁用", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<WorkflowClient />);
    await waitFor(() => expect(screen.getByTestId("wf-no-history")).toBeInTheDocument());
    expect(screen.getByTestId("wf-run")).toBeDisabled();
  });
});
