import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

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

import { RelayKeyCreateDialog } from "./relay-key-create-dialog";

describe("RelayKeyCreateDialog", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    writeTextMock.mockClear();
  });

  it("未填名时创建按钮禁用", () => {
    render(<RelayKeyCreateDialog trigger={<button type="button">t</button>} />);
    expect(screen.getByTestId("relay-key-submit")).toBeDisabled();
  });

  it("填名提交后展示一次性明文并复制", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ secret: "sk-relay-created" }),
    });
    const onSaved = vi.fn();
    render(<RelayKeyCreateDialog trigger={<button type="button">t</button>} onSaved={onSaved} />);
    fireEvent.change(screen.getByTestId("relay-key-name-input"), { target: { value: "博客器" } });
    fireEvent.click(screen.getByTestId("relay-key-submit"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/relay-keys",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "博客器" }) }),
      );
      expect(screen.getByTestId("created-secret")).toHaveTextContent("sk-relay-created");
      expect(onSaved).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByLabelText("复制密钥"));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("sk-relay-created"));
  });

  it("创建失败显示错误", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "重名" }) });
    render(<RelayKeyCreateDialog trigger={<button type="button">t</button>} />);
    fireEvent.change(screen.getByTestId("relay-key-name-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("relay-key-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("重名"));
  });
});
