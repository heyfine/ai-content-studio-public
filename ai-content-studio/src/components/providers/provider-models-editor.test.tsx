import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ProviderModelsEditor } from "./provider-models-editor";

const cfg = { type: "OPENAI_COMPATIBLE", baseUrl: "https://api.x.com", apiKey: "sk-1" };

describe("ProviderModelsEditor", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("无模型时显示空提示", () => {
    render(<ProviderModelsEditor models={[]} onChange={() => {}} providerConfig={cfg} />);
    expect(screen.getByText(/暂无模型/)).toBeInTheDocument();
  });

  it("手动添加模型触发 onChange", () => {
    const onChange = vi.fn();
    render(<ProviderModelsEditor models={[]} onChange={onChange} providerConfig={cfg} />);
    fireEvent.change(screen.getByLabelText("模型名"), { target: { value: "deepseek-chat" } });
    fireEvent.click(screen.getByTestId("add-model"));
    expect(onChange).toHaveBeenCalledWith([{ name: "deepseek-chat", displayName: undefined }]);
  });

  it("重复模型名不重复添加并提示", () => {
    const onChange = vi.fn();
    render(
      <ProviderModelsEditor
        models={[{ name: "gpt-4o", displayName: "GPT-4o" }]}
        onChange={onChange}
        providerConfig={cfg}
      />,
    );
    fireEvent.change(screen.getByLabelText("模型名"), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByTestId("add-model"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/已存在/);
  });

  it("删除模型触发 onChange 去除该项", () => {
    const onChange = vi.fn();
    render(
      <ProviderModelsEditor
        models={[
          { name: "a", displayName: "A" },
          { name: "b", displayName: "B" },
        ]}
        onChange={onChange}
        providerConfig={cfg}
      />,
    );
    fireEvent.click(screen.getByLabelText("删除 b"));
    expect(onChange).toHaveBeenCalledWith([{ name: "a", displayName: "A" }]);
  });

  it("获取模型成功后勾选并加入", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: ["m1", "m2"] }),
    });
    const onChange = vi.fn();
    render(<ProviderModelsEditor models={[]} onChange={onChange} providerConfig={cfg} />);
    fireEvent.click(screen.getByTestId("fetch-models"));
    await waitFor(() => expect(screen.getByTestId("fetched-list")).toBeInTheDocument());
    // 取消勾选 m2，仅加 m1
    const boxes = screen.getAllByRole("checkbox");
    // 默认全选，点击 m2 的 checkbox 取消
    fireEvent.click(boxes[1]); // boxes[0]=m1 boxes[1]=m2
    fireEvent.click(screen.getByTestId("add-selected"));
    expect(onChange).toHaveBeenCalledWith([{ name: "m1", displayName: undefined }]);
  });

  it("获取失败显示错误", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "无效 Key" }) });
    render(<ProviderModelsEditor models={[]} onChange={() => {}} providerConfig={cfg} />);
    fireEvent.click(screen.getByTestId("fetch-models"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无效 Key"));
  });

  it("Gemini 类型禁用获取按钮", () => {
    render(
      <ProviderModelsEditor
        models={[]}
        onChange={() => {}}
        providerConfig={{ type: "GEMINI", baseUrl: "", apiKey: "sk" }}
      />,
    );
    expect(screen.getByTestId("fetch-models")).toBeDisabled();
    expect(screen.getByText(/Gemini/)).toBeInTheDocument();
  });
});
