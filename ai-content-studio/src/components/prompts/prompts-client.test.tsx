import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: () => null,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogClose: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}));

import { PromptsClient, PromptFormDialog, type PromptRow } from "./prompts-client";

describe("PromptsClient", () => {
  beforeEach(() => fetchMock.mockReset());

  it("加载中显示 加载中…", () => {
    // 用可控 deferred 避免永不 resolve 的悬空 promise；断言后 resolve 为合法响应
    let resolveFetch!: (v: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolveFetch = r;
      }),
    );
    render(<PromptsClient />);
    expect(screen.getByText("加载中…")).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => [] } as Response);
  });

  it("响应非 ok 时显示加载失败 alert", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<PromptsClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("加载失败"));
  });

  it("无数据显示空提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<PromptsClient />);
    await waitFor(() => expect(screen.getByText(/暂无 Prompt/)).toBeInTheDocument());
  });

  it("有数据时渲染卡片含类型/版本/启用状态", async () => {
    const rows: PromptRow[] = [
      {
        id: "p1",
        name: "技术文章",
        description: null,
        type: "article_write",
        content: "你是高级作者",
        version: 3,
        active: true,
      },
      {
        id: "p2",
        name: "SEO",
        description: null,
        type: "seo_analyze",
        content: "分析 SEO",
        version: 1,
        active: false,
      },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => rows });
    render(<PromptsClient />);
    await waitFor(() => expect(screen.getByText("技术文章")).toBeInTheDocument());
    expect(screen.getByText(/article_write · v3 · 启用/)).toBeInTheDocument();
    expect(screen.getByText(/seo_analyze · v1 · 禁用/)).toBeInTheDocument();
  });

  it("确认删除后发送 DELETE 并刷新", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "p1",
          name: "X",
          description: null,
          type: "system",
          content: "c",
          version: 1,
          active: true,
        },
      ],
    });
    render(<PromptsClient />);
    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getByLabelText("删除"));
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith("/api/prompts/p1", { method: "DELETE" });
    });
    confirmSpy.mockRestore();
  });

  it("取消删除不发送 DELETE", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "p1",
          name: "X",
          description: null,
          type: "system",
          content: "c",
          version: 1,
          active: true,
        },
      ],
    });
    render(<PromptsClient />);
    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fetchMock.mockClear();
    fireEvent.click(screen.getByLabelText("删除"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("PromptFormDialog", () => {
  beforeEach(() => fetchMock.mockReset());

  it("无 initialValues 显示“添加 Prompt”", () => {
    render(<PromptFormDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByText("添加 Prompt")).toBeInTheDocument();
  });

  it("有 initialValues.id 显示“编辑 Prompt”", () => {
    render(
      <PromptFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{
          id: "p1",
          name: "X",
          type: "system",
          description: "",
          content: "c",
          version: 1,
          active: true,
        }}
      />,
    );
    expect(screen.getByText("编辑 Prompt")).toBeInTheDocument();
  });

  it("提交创建调用 POST 并触发 onSaved", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "new" }) });
    const onSaved = vi.fn();
    render(<PromptFormDialog trigger={<button type="button">t</button>} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "新Prompt" } });
    fireEvent.change(screen.getByLabelText("Prompt 内容"), { target: { value: "你是助手" } });
    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/prompts",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("编辑提交调用 PUT", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <PromptFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{
          id: "p1",
          name: "X",
          type: "system",
          description: "",
          content: "c",
          version: 1,
          active: true,
        }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "新名" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/prompts/p1",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("提交失败显示错误信息", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "名称重复" }) });
    render(
      <PromptFormDialog
        trigger={<button type="button">t</button>}
        initialValues={{
          id: "p1",
          name: "X",
          type: "system",
          description: "",
          content: "c",
          version: 1,
          active: true,
        }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Y" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("名称重复"));
  });

  it("名称或内容为空时提交按钮禁用", () => {
    render(<PromptFormDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByText("创建").closest("button")).toBeDisabled();
  });
});
