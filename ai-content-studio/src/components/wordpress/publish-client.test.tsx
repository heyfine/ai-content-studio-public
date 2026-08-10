import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { PublishClient } from "./publish-client";

function articlesPayload(
  overrides: { id: string; title: string; status: string; wpPostId?: string | null }[] = [
    { id: "a1", title: "文章甲", status: "DRAFT", wpPostId: null },
    { id: "a2", title: "文章乙", status: "PUBLISHED", wpPostId: "77" },
  ],
) {
  return overrides.map((o) => ({ wpPostId: null, ...o }));
}

function configsPayload() {
  return [
    {
      id: "c1",
      name: "我的博客",
      siteUrl: "https://wp.example.com",
      username: "admin",
      enabled: true,
    },
  ];
}

function setupFetch(arts = articlesPayload(), cfgs = configsPayload()) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = url;
    const method = init?.method ?? "GET";
    if (u === "/api/articles" && method === "GET") {
      return { ok: true, json: async () => arts };
    }
    if (u === "/api/wordpress/configs" && method === "GET") {
      return { ok: true, json: async () => cfgs };
    }
    if (u === "/api/wordpress/publish" && method === "POST") {
      return {
        ok: true,
        json: async () => ({
          wpPostId: "101",
          link: "https://wp.example.com/?p=101",
          status: "publish",
          articleId: "a1",
        }),
      };
    }
    if (u.startsWith("/api/wordpress/publish?") && method === "DELETE") {
      return { ok: true, json: async () => ({ deleted: true, articleId: "a2" }) };
    }
    return { ok: false, json: async () => ({ error: "未知请求" }) };
  });
}

describe("PublishClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("渲染标题并加载文章与站点列表", async () => {
    setupFetch();
    render(<PublishClient />);
    expect(screen.getByText("WordPress 发布")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/文章甲/)).toBeInTheDocument());
    expect(screen.getByLabelText("WordPress 站点")).toBeInTheDocument();
  });

  it("选文章并发布成功显示 wpPostId 与链接", async () => {
    setupFetch();
    render(<PublishClient />);
    await waitFor(() => expect(screen.getByText(/文章甲/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择文章"), { target: { value: "a1" } });
    fireEvent.click(screen.getByTestId("wp-publish"));
    await waitFor(() => {
      expect(screen.getByTestId("wp-result")).toBeInTheDocument();
      expect(screen.getByText(/#101/)).toBeInTheDocument();
      expect(screen.getByTestId("wp-link")).toHaveAttribute(
        "href",
        "https://wp.example.com/?p=101",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/wordpress/publish",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("发布失败显示 error", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = url;
      const method = init?.method ?? "GET";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => articlesPayload() };
      if (u === "/api/wordpress/configs" && method === "GET")
        return { ok: true, json: async () => configsPayload() };
      return { ok: false, json: async () => ({ error: "WordPress 发布失败（401）：invalid" }) };
    });
    render(<PublishClient />);
    await waitFor(() => expect(screen.getByText(/文章甲/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择文章"), { target: { value: "a1" } });
    fireEvent.click(screen.getByTestId("wp-publish"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("WordPress 发布失败"));
  });

  it("已发布文章可撤销，撤销后清除已发布标记", async () => {
    setupFetch();
    render(<PublishClient />);
    await waitFor(() => expect(screen.getByText(/文章乙/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择文章"), { target: { value: "a2" } });
    expect(screen.getByTestId("wp-existing")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("wp-unpublish"));
    await waitFor(() => {
      const called = fetchMock.mock.calls.find(
        ([u, init]) =>
          typeof u === "string" &&
          u.startsWith("/api/wordpress/publish?") &&
          (init as RequestInit)?.method === "DELETE",
      );
      expect(called).toBeTruthy();
    });
    await waitFor(() => expect(screen.queryByTestId("wp-existing")).not.toBeInTheDocument());
  });

  it("未发布文章时撤销按钮禁用", async () => {
    setupFetch();
    render(<PublishClient />);
    await waitFor(() => expect(screen.getByText(/文章甲/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择文章"), { target: { value: "a1" } });
    expect(screen.getByTestId("wp-unpublish")).toBeDisabled();
  });

  it("无启用站点时显示提示且发布按钮禁用", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = url;
      const method = init?.method ?? "GET";
      if (u === "/api/articles" && method === "GET")
        return { ok: true, json: async () => articlesPayload() };
      return { ok: true, json: async () => [] };
    });
    render(<PublishClient />);
    await waitFor(() => expect(screen.getByTestId("no-config")).toBeInTheDocument());
    expect(screen.getByTestId("wp-publish")).toBeDisabled();
  });

  it("无文章时显示提示", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = url;
      const method = init?.method ?? "GET";
      if (u === "/api/articles" && method === "GET") return { ok: true, json: async () => [] };
      return { ok: true, json: async () => configsPayload() };
    });
    render(<PublishClient />);
    await waitFor(() => expect(screen.getByTestId("no-articles")).toBeInTheDocument());
    expect(screen.queryByLabelText("选择文章")).not.toBeInTheDocument();
  });
});
