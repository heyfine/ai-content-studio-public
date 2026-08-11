import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useStudioStore } from "@/stores/studio-store";
import { BlogPublishDialog } from "./blog-publish-dialog";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function okJson(data: unknown) {
  return { ok: true, json: async () => data };
}

function resetStore() {
  useStudioStore.setState({
    title: "我的标题",
    content: "原文",
    messages: [],
    generations: [
      {
        id: "g1",
        task: "article_generate",
        index: 1,
        content: "第一次结果",
        createdAt: "14:32:05",
      },
      {
        id: "g2",
        task: "article_generate",
        index: 2,
        content: "第二次结果",
        createdAt: "14:35:11",
      },
    ],
    selectedTask: "article_generate",
    lastPromptByTask: {},
    isGenerating: false,
    error: null,
    articleId: null,
    articleStatus: null,
  });
}

describe("BlogPublishDialog", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("打开时加载启用的博客站点，默认选中第一个；生成结果默认选最后一次", async () => {
    fetchMock.mockResolvedValue(
      okJson([
        { id: "c1", name: "技术博客", siteUrl: "https://tech.example.com", enabled: true },
        { id: "c2", name: "生活博客", siteUrl: "https://life.example.com", enabled: false },
      ]),
    );
    render(<BlogPublishDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("一键发送到博客")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("发送到哪个博客")).toBeInTheDocument());
    const blogSelect = screen.getByLabelText("发送到哪个博客") as HTMLSelectElement;
    expect(Array.from(blogSelect.options).map((o) => o.value)).toEqual(["c1"]);
    expect(blogSelect.value).toBe("c1");
    const genSelect = screen.getByLabelText("选择生成结果") as HTMLSelectElement;
    expect(genSelect.value).toBe("g2");
  });

  it("无启用站点时提示去发布板块新建", async () => {
    fetchMock.mockResolvedValue(okJson([{ id: "c1", name: "x", siteUrl: "u", enabled: false }]));
    render(<BlogPublishDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("blog-no-config")).toBeInTheDocument());
  });

  it("无生成结果时提示先在右侧生成", async () => {
    fetchMock.mockResolvedValue(okJson([]));
    useStudioStore.setState({ generations: [] });
    render(<BlogPublishDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("blog-no-gen")).toBeInTheDocument());
  });

  it("发送：POST /api/wordpress/publish 携带所选生成结果与站点，成功后展示链接", async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson([
          { id: "c1", name: "技术博客", siteUrl: "https://tech.example.com", enabled: true },
        ]),
      )
      .mockResolvedValueOnce(
        okJson({ wpPostId: "88", link: "https://tech.example.com/?p=88", status: "publish" }),
      );
    render(<BlogPublishDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("blog-publish-send")).toBeInTheDocument());
    // 选第一次
    fireEvent.change(screen.getByLabelText("选择生成结果"), { target: { value: "g1" } });
    fireEvent.click(screen.getByTestId("blog-publish-send"));
    await waitFor(() => expect(screen.getByTestId("blog-publish-link")).toBeInTheDocument());
    const publishCall = fetchMock.mock.calls.find((c) => c[0] === "/api/wordpress/publish");
    expect(publishCall).toBeTruthy();
    const body = JSON.parse((publishCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      title: "我的标题",
      content: "第一次结果",
      configId: "c1",
      wpStatus: "publish",
    });
    expect(screen.getByTestId("blog-publish-link")).toHaveAttribute(
      "href",
      "https://tech.example.com/?p=88",
    );
  });

  it("发送失败显示错误", async () => {
    fetchMock
      .mockResolvedValueOnce(okJson([{ id: "c1", name: "技术博客", siteUrl: "u", enabled: true }]))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "站点不可用" }) });
    render(<BlogPublishDialog open onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("blog-publish-send")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("blog-publish-send"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("站点不可用"));
  });
});
