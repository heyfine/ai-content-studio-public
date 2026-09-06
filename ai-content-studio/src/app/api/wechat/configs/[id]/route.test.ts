import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, deleteConfigMock, updateCoverMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  deleteConfigMock: vi.fn(),
  updateCoverMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/wechat-service", () => ({
  deleteWechatConfig: deleteConfigMock,
  updateWechatDefaultCover: updateCoverMock,
}));

import { DELETE, PUT } from "./route";

const params = { params: Promise.resolve({ id: "wc1" }) };

function makePutRequest(body: unknown) {
  return new Request("https://localhost/api/wechat/configs/wc1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/wechat/configs/[id]（默认封面）", () => {
  beforeEach(() => {
    authMock.mockReset();
    updateCoverMock.mockReset();
    deleteConfigMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makePutRequest({ defaultCoverUrl: null }), params);
    expect(res.status).toBe(401);
  });

  it("URL 非法返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await PUT(makePutRequest({ defaultCoverUrl: "not-a-url" }), params);
    expect(res.status).toBe(400);
  });

  it("合法 URL 更新成功返回 id 与 defaultCoverUrl", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    updateCoverMock.mockResolvedValue({
      id: "wc1",
      defaultCoverUrl: "https://cdn.example.com/cover.jpg",
    });
    const res = await PUT(
      makePutRequest({ defaultCoverUrl: "https://cdn.example.com/cover.jpg" }),
      params,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "wc1" });
    expect(updateCoverMock).toHaveBeenCalledWith("wc1", "https://cdn.example.com/cover.jpg");
  });

  it("null 表示清空默认封面", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    updateCoverMock.mockResolvedValue({ id: "wc1", defaultCoverUrl: null });
    const res = await PUT(makePutRequest({ defaultCoverUrl: null }), params);
    expect(res.status).toBe(200);
    expect(updateCoverMock).toHaveBeenCalledWith("wc1", null);
  });

  it("配置不存在返回 404", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    updateCoverMock.mockRejectedValue(new Error("公众号配置不存在或已删除"));
    const res = await PUT(makePutRequest({ defaultCoverUrl: null }), params);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/wechat/configs/[id]", () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteConfigMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(new Request("https://localhost/api/wechat/configs/wc1"), params);
    expect(res.status).toBe(401);
  });

  it("删除成功返回 ok", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    deleteConfigMock.mockResolvedValue(undefined);
    const res = await DELETE(new Request("https://localhost/api/wechat/configs/wc1"), params);
    expect(res.status).toBe(200);
  });
});
