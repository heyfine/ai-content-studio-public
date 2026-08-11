import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { ProviderToggle } from "./provider-toggle";

describe("ProviderToggle", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("enabled 时显示启用并 aria-pressed=true", () => {
    render(<ProviderToggle id="p1" enabled={true} />);
    expect(screen.getByText("启用")).toBeInTheDocument();
    expect(screen.getByLabelText(/点击禁用/)).toHaveAttribute("aria-pressed", "true");
  });

  it("disabled 时显示禁用", () => {
    render(<ProviderToggle id="p1" enabled={false} />);
    expect(screen.getByText("禁用")).toBeInTheDocument();
  });

  it("点击切换发送 PUT {enabled:取反} 并触发 onToggled", async () => {
    const onToggled = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<ProviderToggle id="p1" enabled={true} onToggled={onToggled} />);
    fireEvent.click(screen.getByText("启用"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/providers/p1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ enabled: false }),
        }),
      );
      expect(onToggled).toHaveBeenCalled();
    });
  });

  it("切换失败显示错误", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "禁止禁用" }) });
    render(<ProviderToggle id="p1" enabled={false} />);
    fireEvent.click(screen.getByText("禁用"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("禁止禁用"));
  });
});
