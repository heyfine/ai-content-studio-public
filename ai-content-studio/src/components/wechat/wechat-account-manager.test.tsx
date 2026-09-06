import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { WechatAccountManager } from "./wechat-account-manager";

const sampleAccounts = [
  { id: "wc1", name: "我的订阅号", appId: "wx1234567890abcdef", enabled: true },
];

describe("WechatAccountManager", () => {
  beforeEach(() => fetchMock.mockReset());

  it("无账号时显示空提示与添加按钮", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<WechatAccountManager />);
    await waitFor(() => expect(screen.getByText(/还没有公众号账号/)).toBeInTheDocument());
    expect(screen.getByTestId("wechat-new-account")).toBeInTheDocument();
  });

  it("展示账号行（名称 + AppID）", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleAccounts });
    render(<WechatAccountManager />);
    await waitFor(() => expect(screen.getByText("我的订阅号")).toBeInTheDocument());
    expect(screen.getByText(/wx1234567890abcdef/)).toBeInTheDocument();
  });

  it("添加公众号：填写表单提交 POST 并刷新列表", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // 初始 GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new1" }) }) // POST
      .mockResolvedValue({ ok: true, json: async () => sampleAccounts }); // 刷新 GET
    render(<WechatAccountManager />);
    await waitFor(() => expect(screen.getByText(/还没有公众号账号/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("wechat-new-account"));
    await waitFor(() => expect(screen.getByLabelText("公众号名称（备注）")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("公众号名称（备注）"), {
      target: { value: "我的订阅号" },
    });
    fireEvent.change(screen.getByLabelText("AppID"), {
      target: { value: "wx1234567890abcdef" },
    });
    fireEvent.change(screen.getByLabelText("AppSecret"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wechat/configs",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const postBody = JSON.parse(
      (fetchMock.mock.calls.find((c) => c[1]?.method === "POST")?.[1] as RequestInit)
        .body as string,
    );
    expect(postBody).toMatchObject({ appId: "wx1234567890abcdef" });
    expect(postBody.appSecret).toBe("s3cret");
  });

  it("AppID 格式非法时前端拦截提示", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    render(<WechatAccountManager />);
    await waitFor(() => expect(screen.getByTestId("wechat-new-account")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("wechat-new-account"));
    await waitFor(() => expect(screen.getByLabelText("公众号名称（备注）")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("公众号名称（备注）"), { target: { value: "号" } });
    fireEvent.change(screen.getByLabelText("AppID"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("AppSecret"), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/AppID 格式不正确/));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/wechat/configs", expect.anything());
  });

  it("确认后删除账号", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleAccounts });
    render(<WechatAccountManager />);
    await waitFor(() => expect(screen.getByText("我的订阅号")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("wechat-delete-wc1"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/wechat/configs/wc1", { method: "DELETE" });
    });
    confirmSpy.mockRestore();
  });
});
