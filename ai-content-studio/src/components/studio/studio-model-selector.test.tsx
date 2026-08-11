import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { useStudioStore } from "@/stores/studio-store";
import { StudioModelSelector } from "./studio-model-selector";

function resetStore() {
  useStudioStore.setState({
    selectedTask: "article_generate",
    isGenerating: false,
  });
}

const providersPayload = () => [
  {
    id: "p1",
    name: "DeepSeek",
    enabled: true,
    models: [
      { id: "m1", name: "deepseek-chat", displayName: "DeepSeek V3", enabled: true },
      { id: "m2", name: "deepseek-reasoner", displayName: "R1", enabled: false },
    ],
  },
  { id: "p2", name: "Off", enabled: false, models: [] },
];

const routesPayload = () => ({
  routes: [{ id: "r1", task: "article_generate", modelId: "m1" }],
});

describe("StudioModelSelector", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("按供应商分组渲染可用模型，并在 optgroup 标注供应商名", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => routesPayload() };
      return { ok: true, json: async () => providersPayload() };
    });
    render(<StudioModelSelector />);
    await waitFor(() => {
      const grp = screen.getByRole("group", { name: "DeepSeek" });
      expect(grp).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "deepseek-chat" })).toBeInTheDocument();
      // 仅 enabled 模型可选项
      expect(screen.queryByRole("option", { name: "deepseek-reasoner" })).not.toBeInTheDocument();
    });
  });

  it("显示当前在用的供应商与模型", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => routesPayload() };
      return { ok: true, json: async () => providersPayload() };
    });
    render(<StudioModelSelector />);
    await waitFor(() =>
      expect(screen.getByTestId("current-model")).toHaveTextContent("DeepSeek · DeepSeek V3"),
    );
  });

  it("切换模型发送 PUT /api/task-routes 更新当前任务路由", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => routesPayload() };
      return { ok: true, json: async () => providersPayload() };
    });
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("model-select")).toBeInTheDocument());
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes")
        return {
          ok: true,
          json: async () => ({ id: "r1", task: "article_generate", modelId: "m1" }),
        };
      return { ok: true, json: async () => providersPayload() };
    });
    fireEvent.change(screen.getByLabelText("选择模型"), { target: { value: "m1" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/task-routes",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ task: "article_generate", modelId: "m1" }),
        }),
      ),
    );
  });

  it("无可用模型时提示去添加", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => ({ routes: [] }) };
      return { ok: true, json: async () => [] };
    });
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByText(/暂无可用模型/)).toBeInTheDocument());
  });
});
