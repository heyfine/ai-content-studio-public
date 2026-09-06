import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, sendDraftMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  sendDraftMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/wechat-service", () => ({
  WechatApiError: class WechatApiError extends Error {
    constructor(
      public code: number,
      message: string,
    ) {
      super(message);
    }
  },
  sendArticleToWechatDraft: sendDraftMock,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/wechat/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  articleId: "a1",
  configId: "wc1",
  content: '<section style="f:1"><p style="m:0">正文</p></section>',
};

describe("POST /api/wechat/draft", () => {
  beforeEach(() => {
    authMock.mockReset();
    sendDraftMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("缺字段返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeRequest({ articleId: "a1" }));
    expect(res.status).toBe(400);
  });

  it("成功返回草稿 media_id", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    sendDraftMock.mockResolvedValue({ mediaId: "DRAFT_MID" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mediaId: "DRAFT_MID" });
    expect(sendDraftMock).toHaveBeenCalledWith("wc1", "a1", validBody.content);
  });

  it("WechatApiError（如 IP 白名单）返回 502 并透传中文提示", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const { WechatApiError } = await import("@/lib/services/wechat-service");
    sendDraftMock.mockRejectedValue(
      new (WechatApiError as new (code: number, msg: string) => Error & { code: number })(
        40164,
        "本机出口 IP 1.2.3.4 不在公众号 IP 白名单内",
      ),
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { errcode: number; error: string };
    expect(data.errcode).toBe(40164);
    expect(data.error).toContain("IP 白名单");
  });

  it("文章/配置不存在返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    sendDraftMock.mockRejectedValue(new Error("公众号配置不存在或未启用"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });
});
