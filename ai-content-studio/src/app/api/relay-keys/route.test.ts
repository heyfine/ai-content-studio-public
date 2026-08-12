import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listMock, createMock, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listMock: vi.fn(),
  createMock: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/relay-service", () => ({
  listRelayKeys: listMock,
  createRelayKey: createMock,
}));
vi.mock("@/lib/schemas/relay", () => ({
  createRelayKeySchema: { safeParse: schemaParse },
}));

import { GET, POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://localhost/api/relay-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/relay-keys", () => {
  beforeEach(() => authMock.mockReset());

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("登录后返回掩码列表", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([
      {
        id: "k1",
        name: "外部",
        keyMasked: "sk-relay-aa••••",
        keyPrefix: "sk-relay-aa",
        enabled: true,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].keyMasked).toBe("sk-relay-aa••••");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/relay-keys", () => {
  beforeEach(() => {
    authMock.mockReset();
    schemaParse.mockReset();
    createMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: false, error: { issues: [] } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("校验通过创建返回 201 含明文", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: true, data: { name: "外部" } });
    createMock.mockResolvedValue({
      row: { id: "k1", name: "外部", keyMasked: "sk-relay-aa••••" },
      secret: "sk-relay-aaabcdef",
    });
    const res = await POST(makeRequest({ name: "外部" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.secret).toBe("sk-relay-aaabcdef");
    expect(createMock).toHaveBeenCalledWith("外部");
  });
});
