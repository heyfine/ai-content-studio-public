import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { TaskRoutesClient } from "./task-routes-client";
import { taskRouteDefinitions } from "@/config/task-routes";

function mockGetResponse(
  routes: { id: string; task: string; modelId: string }[],
  models: { id: string; label: string }[],
) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return {
        ok: true,
        json: async () => ({ routes, models }),
      } as Response;
    }
    const body = JSON.parse(init?.body as string);
    return {
      ok: true,
      json: async () => ({ id: "r1", task: body.task, modelId: body.modelId }),
    } as Response;
  });
}

describe("TaskRoutesClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("初始渲染显示加载中", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<TaskRoutesClient />);
    expect(screen.getByText("加载中…")).toBeInTheDocument();
  });

  it("加载后渲染全部任务定义卡片", async () => {
    mockGetResponse([], [{ id: "m1", label: "Model-1" }]);
    render(<TaskRoutesClient />);
    for (const def of taskRouteDefinitions) {
      await waitFor(() => expect(screen.getByText(def.label)).toBeInTheDocument());
    }
  });

  it("无可用模型时显示提示卡片", async () => {
    mockGetResponse([], []);
    render(<TaskRoutesClient />);
    await waitFor(() => expect(screen.getByText("暂无可用模型")).toBeInTheDocument());
  });

  it("GET 请求失败时显示错误", async () => {
    fetchMock.mockRejectedValue(new Error("网络异常"));
    render(<TaskRoutesClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("网络异常"));
  });

  it("已分配路由的 Save 按钮可点击且发送 PUT", async () => {
    const routes = [{ id: "r1", task: "article_generate", modelId: "m1" }];
    const models = [{ id: "m1", label: "GPT-4o" }];
    mockGetResponse(routes, models);
    render(<TaskRoutesClient />);

    await waitFor(() => expect(screen.getByText("文章生成")).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("保存")[0]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/task-routes",
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: "article_generate", modelId: "m1" }),
        }),
      ),
    );
  });

  it("保存失败时显示错误", async () => {
    const routes = [{ id: "r1", task: "article_generate", modelId: "m1" }];
    const models = [{ id: "m1", label: "GPT-4o" }];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return { ok: true, json: async () => ({ routes, models }) } as Response;
      }
      return { ok: false, json: async () => ({ error: "db error" }) } as Response;
    });

    render(<TaskRoutesClient />);
    await waitFor(() => expect(screen.getByText("文章生成")).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("保存")[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败"));
  });

  it("未分配路由的 Save 按钮禁用", async () => {
    const models = [{ id: "m1", label: "GPT-4o" }];
    mockGetResponse([], models);
    render(<TaskRoutesClient />);
    await waitFor(() => expect(screen.getByText("文章生成")).toBeInTheDocument());
    const saveButtons = screen.getAllByText("保存");
    for (const btn of saveButtons) {
      expect(btn.closest("button")).toBeDisabled();
    }
  });
});
