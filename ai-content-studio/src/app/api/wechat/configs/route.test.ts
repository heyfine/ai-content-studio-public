import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, listConfigsMock, createConfigMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listConfigsMock: vi.fn(),
  createConfigMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/wechat-service", () => ({
  listWechatConfigs: listConfigsMock,
  createWechatConfig: createConfigMock,
}));

import { GET, POST } from "./route";

function makePostRequest(body: unknown) {
  return new Request("https://localhost/api/wechat/configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/wechat/configs", () => {
  beforeEach(() => {
    authMock.mockReset();
    listConfigsMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("返回脱敏配置列表（无 appSecret）", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listConfigsMock.mockResolvedValue([
      {
        id: "wc1",
        name: "我的订阅号",
        appId: "wx1234567890abcdef",
        appSecret: "enc-secret",
        enabled: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<Record<string, unknown>>;
    expect(data[0]).toMatchObject({ id: "wc1", name: "我的订阅号", appId: "wx1234567890abcdef" });
    expect(JSON.stringify(data)).not.toContain("enc-secret");
  });
});

describe("POST /api/wechat/configs", () => {
  beforeEach(() => {
    authMock.mockReset();
    createConfigMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
  });

  it("AppID 格式非法返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makePostRequest({ name: "号", appId: "bad-id", appSecret: "s" }));
    expect(res.status).toBe(400);
  });

  it("合法配置创建成功返回 201", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    createConfigMock.mockResolvedValue({ id: "new1" });
    const res = await POST(
      makePostRequest({
        name: "我的订阅号",
        appId: "wx1234567890abcdef",
        appSecret: "secret",
      }),
    );
    expect(res.status).toBe(201);
    expect(createConfigMock).toHaveBeenCalledWith({
      name: "我的订阅号",
      appId: "wx1234567890abcdef",
      appSecret: "secret",
      enabled: true,
    });
  });
});
