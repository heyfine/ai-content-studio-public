import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { SeoClient } from "./seo-client";

function articlesPayload() {
  return [
    { id: "a1", title: "文章甲", status: "DRAFT" },
    { id: "a2", title: "文章乙", status: "PUBLISHED" },
  ];
}

describe("SeoClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("渲染标题与两个模式按钮，默认选文章", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => articlesPayload() });
    render(<SeoClient />);
    expect(screen.getByText("SEO 分析")).toBeInTheDocument();
    expect(screen.getByText("选文章")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("选择文章")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("文章甲")).toBeInTheDocument());
  });

  it("选文章 + 分析成功显示评分与建议", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/articles") return { ok: true, json: async () => articlesPayload() };
      return {
        ok: true,
        json: async () => ({
          score: 88,
          keywords: ["next", "vercel"],
          issues: ["缺少 Meta 描述"],
          suggestions: ["补充 Meta 描述"],
          saved: true,
          reportId: "r1",
        }),
      };
    });
    render(<SeoClient />);
    await waitFor(() => expect(screen.getByText("文章甲")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择文章"), { target: { value: "a1" } });
    fireEvent.click(screen.getByTestId("seo-analyze"));
    await waitFor(() => {
      expect(screen.getByTestId("seo-score")).toHaveTextContent("88");
      expect(screen.getByText("next")).toBeInTheDocument();
      expect(screen.getByText("缺少 Meta 描述")).toBeInTheDocument();
      expect(screen.getByText("补充 Meta 描述")).toBeInTheDocument();
      expect(screen.getByText(/已存为报告/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seo/analyze",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("粘贴预览模式用 title+content 调用", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ score: 60, keywords: [], issues: [], suggestions: [] }),
    });
    render(<SeoClient />);
    fireEvent.click(screen.getByText("粘贴预览"));
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "## 概述\n正文。" } });
    fireEvent.click(screen.getByTestId("seo-analyze"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seo/analyze",
        expect.objectContaining({ body: expect.stringContaining("测试标题") }),
      );
      expect(screen.getByTestId("seo-score")).toHaveTextContent("60");
    });
  });

  it("分析失败显示 error", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/articles") return { ok: true, json: async () => articlesPayload() };
      return { ok: false, json: async () => ({ error: "文章不存在" }) };
    });
    render(<SeoClient />);
    await waitFor(() => expect(screen.getByText("文章甲")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择文章"), { target: { value: "a1" } });
    fireEvent.click(screen.getByTestId("seo-analyze"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("文章不存在"));
  });

  it("未选文章时分析按钮禁用", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => articlesPayload() });
    render(<SeoClient />);
    await waitFor(() => expect(screen.getByText("文章甲")).toBeInTheDocument());
    expect(screen.getByTestId("seo-analyze")).toBeDisabled();
  });
});
