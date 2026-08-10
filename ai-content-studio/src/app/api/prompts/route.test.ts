import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, listMock, createMock, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listMock: vi.fn(),
  createMock: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/prompt-service", () => ({
  listPrompts: listMock,
  createPrompt: createMock,
}));
vi.mock("@/lib/schemas/prompt", () => ({
  createPromptSchema: { safeParse: schemaParse },
}));

import { GET, POST } from "./route";

function makeGetRequest(type?: string) {
  const url = type ? `https://localhost/api/prompts?type=${type}` : "https://localhost/api/prompts";
  return new Request(url);
}
function makePostRequest(body: unknown) {
  return new Request("https://localhost/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/prompts", () => {
  beforeEach(() => {
    authMock.mockReset();
    listMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("登录后无 type 返回全部", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([{ id: "p1" }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith(undefined);
  });

  it("带 type 时透传过滤", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([]);
    const res = await GET(makeGetRequest("seo"));
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith("seo");
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockRejectedValue(new Error("db"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/prompts", () => {
  beforeEach(() => {
    authMock.mockReset();
    schemaParse.mockReset();
    createMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: false, error: { issues: [] } });
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("成功创建返回 201", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const values = { type: "t", name: "x", content: "c" };
    schemaParse.mockReturnValue({ success: true, data: values });
    createMock.mockResolvedValue({ id: "p1", name: "x" });
    const res = await POST(makePostRequest(values));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(values);
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: true, data: {} });
    createMock.mockRejectedValue(new Error("dup"));
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(500);
  });
});
