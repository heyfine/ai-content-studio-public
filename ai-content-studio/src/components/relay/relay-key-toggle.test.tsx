import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { RelayKeyToggle } from "./relay-key-toggle";

describe("RelayKeyToggle", () => {
  beforeEach(() => fetchMock.mockReset());

  it("enabled 时开关 aria-checked=true、绿色", () => {
    render(<RelayKeyToggle id="k1" enabled={true} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw.className).toContain("bg-emerald-500");
  });

  it("disabled 时开关 aria-checked=false、灰色", () => {
    render(<RelayKeyToggle id="k1" enabled={false} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw.className).toContain("bg-gray-300");
  });

  it("点击切换发 PUT {enabled:取反} 并触 onToggled", async () => {
    const onToggled = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<RelayKeyToggle id="k1" enabled={true} onToggled={onToggled} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/relay-keys/k1",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: false }) }),
      );
      expect(onToggled).toHaveBeenCalled();
    });
  });

  it("切换失败显示错误", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "禁止禁用" }) });
    render(<RelayKeyToggle id="k1" enabled={false} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("禁止禁用"));
  });
});
