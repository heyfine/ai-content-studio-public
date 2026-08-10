import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestConnectionButton } from "./test-connection-button";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

describe("TestConnectionButton", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("成功时显示延迟与模型数", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, latencyMs: 120, models: ["a", "b"] }),
    });
    render(<TestConnectionButton providerId="p1" />);
    fireEvent.click(screen.getByText("测试连接"));
    await waitFor(() => expect(screen.getByText(/连接成功 120ms（2 模型）/)).toBeInTheDocument());
  });

  it("失败时显示错误信息", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: "invalid key" }),
    });
    render(<TestConnectionButton providerId="p1" />);
    fireEvent.click(screen.getByText("测试连接"));
    await waitFor(() => expect(screen.getByText(/失败：invalid key/)).toBeInTheDocument());
  });

  it("网络异常也能显示错误", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    render(<TestConnectionButton providerId="p1" />);
    fireEvent.click(screen.getByText("测试连接"));
    await waitFor(() => expect(screen.getByText(/失败：network/)).toBeInTheDocument());
  });
});
