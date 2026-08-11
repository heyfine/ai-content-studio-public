import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listConfigsMock, createConfigMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listConfigsMock: vi.fn(),
  createConfigMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/wordpress-service", () => ({
  listWordpressConfigs: listConfigsMock,
  createWordpressConfig: createConfigMock,
}));

import { GET, POST } from "./route";

function makePostRequest(body: unknown) {
  return new Request("https://localhost/api/wordpress/configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/wordpress/configs", () => {
  beforeEach(() => {
    authMock.mockReset();
    listConfigsMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("返回脱敏配置列表（无 appPassword）", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listConfigsMock.mockResolvedValue([
      {
        id: "c1",
        name: "我的博客",
        siteUrl: "https://wp.example.com",
        username: "admin",
        appPassword: "enc-secret",
        enabled: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("c1");
    expect(data[0].appPassword).toBeUndefined();
    expect(data[0].name).toBe("我的博客");
  });

  it("无配置返回空数组", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listConfigsMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /api/wordpress/configs", () => {
  beforeEach(() => {
    authMock.mockReset();
    createConfigMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(
      makePostRequest({ name: "博客", siteUrl: "https://a.com", username: "u", appPassword: "p" }),
    );
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(
      makePostRequest({ name: "", siteUrl: "not-a-url", username: "", appPassword: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("创建成功返回 201 与 id", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    createConfigMock.mockResolvedValue({ id: "c9" });
    const res = await POST(
      makePostRequest({
        name: "技术博客",
        siteUrl: "https://blog.example.com/",
        username: "admin",
        appPassword: "app-pwd",
        enabled: false,
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "c9" });
    expect(createConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "技术博客",
        siteUrl: "https://blog.example.com",
        username: "admin",
        appPassword: "app-pwd",
        enabled: false,
      }),
    );
  });
});
