import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

import { RelayKeyCell } from "./relay-key-cell";

describe("RelayKeyCell", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    writeTextMock.mockClear();
  });

  it("默认显示掩码", () => {
    render(<RelayKeyCell id="k1" keyMasked="sk-relay-aa••••" />);
    expect(screen.getByTestId("relay-key-display")).toHaveTextContent("sk-relay-aa••••");
  });

  it("点眼睛从库拉明文并显示", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ key: "sk-relay-real" }) });
    render(<RelayKeyCell id="k1" keyMasked="sk-relay-aa••••" />);
    fireEvent.click(screen.getByTestId("relay-reveal"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/relay-keys/k1/reveal");
      expect(screen.getByTestId("relay-key-display")).toHaveTextContent("sk-relay-real");
    });
  });

  it("再点眼睛切回掩码", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ key: "sk-relay-real" }) });
    render(<RelayKeyCell id="k1" keyMasked="sk-relay-aa••••" />);
    fireEvent.click(screen.getByTestId("relay-reveal"));
    await waitFor(() =>
      expect(screen.getByTestId("relay-key-display")).toHaveTextContent("sk-relay-real"),
    );
    fireEvent.click(screen.getByTestId("relay-reveal"));
    expect(screen.getByTestId("relay-key-display")).toHaveTextContent("sk-relay-aa••••");
  });

  it("复制按钮调用 clipboard 写入当前显示值并提示已复制", async () => {
    render(<RelayKeyCell id="k1" keyMasked="sk-relay-aa••••" />);
    fireEvent.click(screen.getByTestId("relay-copy"));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("sk-relay-aa••••");
      expect(screen.getByTestId("relay-copied-tip")).toBeInTheDocument();
    });
  });
});
