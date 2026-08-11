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
    reasoningEnabled: false,
    reasoningEffort: "medium",
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
  {
    id: "p2",
    name: "OpenAI",
    enabled: true,
    models: [{ id: "m3", name: "gpt-4o", displayName: "GPT-4o", enabled: true }],
  },
  { id: "p3", name: "Off", enabled: false, models: [] },
];

const routesPayload = () => ({
  routes: [{ id: "r1", task: "article_generate", modelId: "m1" }],
});

function withData() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/task-routes") return { ok: true, json: async () => routesPayload() };
    return { ok: true, json: async () => providersPayload() };
  });
}

describe("StudioModelSelector", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("供应商下拉列已启用供应商；模型下拉先选供应商才可选", async () => {
    withData();
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("provider-select")).toBeInTheDocument());
    const prov = screen.getByTestId("provider-select");
    expect(screen.getByRole("option", { name: "DeepSeek" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Off" })).not.toBeInTheDocument();
    // 模型下拉未选供应商时为"先选供应商"
    expect(screen.getByTestId("model-select")).toBeDisabled();
  });

  it("任务按当前路由自动定位供应商与模型，显示当前", async () => {
    withData();
    render(<StudioModelSelector />);
    await waitFor(() => {
      expect(screen.getByTestId("provider-select")).toHaveValue("p1");
      expect(screen.getByTestId("model-select")).toHaveValue("m1");
      expect(screen.getByTestId("current-model")).toHaveTextContent("DeepSeek · DeepSeek V3");
    });
  });

  it("选供应商后模型下拉只列该供应商已启用模型，选中触发 PUT", async () => {
    withData();
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("current-model")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("provider-select"), { target: { value: "p2" } });
    const mdl = screen.getByTestId("model-select");
    expect(mdl).not.toBeDisabled();
    expect(screen.getByRole("option", { name: "gpt-4o" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "deepseek-chat" })).not.toBeInTheDocument();
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes")
        return {
          ok: true,
          json: async () => ({ id: "r1", task: "article_generate", modelId: "m3" }),
        };
      return { ok: true, json: async () => providersPayload() };
    });
    fireEvent.change(mdl, { target: { value: "m3" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/task-routes",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ task: "article_generate", modelId: "m3" }),
        }),
      ),
    );
  });

  it("全选模式：选模型后批量 PUT 所有任务", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => ({ routes: [] }) };
      return { ok: true, json: async () => providersPayload() };
    });
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("provider-select")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("选择任务"), { target: { value: "all" } });
    expect(screen.getByTestId("all-hint")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("provider-select"), { target: { value: "p1" } });
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => providersPayload() };
    });
    fireEvent.change(screen.getByTestId("model-select"), { target: { value: "m1" } });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c: unknown[]) => c[0] === "/api/task-routes");
      // 所有任务都 PUT 同一模型 m1
      const bodies = calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
      expect(bodies.length).toBeGreaterThan(1);
      expect(bodies.every((b) => b.modelId === "m1")).toBe(true);
    });
  });

  it("无可用供应商时提示去添加", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/task-routes") return { ok: true, json: async () => ({ routes: [] }) };
      return { ok: true, json: async () => [] };
    });
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByText(/暂无可用模型/)).toBeInTheDocument());
  });
});

describe("StudioModelSelector reasoning", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetStore();
  });

  it("默认深度思考关闭，无推理强度下拉", async () => {
    withData();
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("provider-select")).toBeInTheDocument());
    expect(screen.getByTestId("reasoning-toggle")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("推理强度")).not.toBeInTheDocument();
  });

  it("开启深度思考后出现推理强度下拉，默认 medium", async () => {
    withData();
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("provider-select")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("reasoning-toggle"));
    expect(screen.getByTestId("reasoning-toggle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("推理强度")).toBeInTheDocument();
    expect(screen.getByLabelText("推理强度")).toHaveValue("medium");
    expect(useStudioStore.getState().reasoningEnabled).toBe(true);
  });

  it("切换推理强度更新 store", async () => {
    withData();
    render(<StudioModelSelector />);
    await waitFor(() => expect(screen.getByTestId("provider-select")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("reasoning-toggle"));
    fireEvent.change(screen.getByLabelText("推理强度"), { target: { value: "high" } });
    expect(useStudioStore.getState().reasoningEffort).toBe("high");
  });
});
