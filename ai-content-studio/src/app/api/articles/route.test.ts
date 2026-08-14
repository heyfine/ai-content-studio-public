import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, listMock, listTrashMock, createMock, schemaParse } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listMock: vi.fn(),
  listTrashMock: vi.fn(),
  createMock: vi.fn(),
  schemaParse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/article-service", () => ({
  listArticles: listMock,
  listTrashedArticles: listTrashMock,
  createArticle: createMock,
}));
vi.mock("@/lib/schemas/article", () => ({
  createArticleSchema: { safeParse: schemaParse },
}));

import { GET, POST } from "./route";

function makeGetRequest(status?: string) {
  const url = status
    ? `https://localhost/api/articles?status=${status}`
    : "https://localhost/api/articles";
  return new Request(url);
}
function makePostRequest(body: unknown) {
  return new Request("https://localhost/api/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/articles", () => {
  beforeEach(() => {
    authMock.mockReset();
    listMock.mockReset();
    listTrashMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET(makeGetRequest())).status).toBe(401);
  });

  it("无 status 返回全部", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([]);
    await GET(makeGetRequest());
    expect(listMock).toHaveBeenCalledWith(undefined);
    expect(listTrashMock).not.toHaveBeenCalled();
  });

  it("带 status 透传", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([]);
    await GET(makeGetRequest("PUBLISHED"));
    expect(listMock).toHaveBeenCalledWith("PUBLISHED");
  });

  it("trashed=true 返回回收站列表", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listTrashMock.mockResolvedValue([{ id: "a1" }]);
    const res = await GET(new Request("https://localhost/api/articles?trashed=true"));
    expect(listTrashMock).toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("service 异常返回 500", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockRejectedValue(new Error("db"));
    expect((await GET(makeGetRequest())).status).toBe(500);
  });
});

describe("POST /api/articles", () => {
  beforeEach(() => {
    authMock.mockReset();
    schemaParse.mockReset();
    createMock.mockReset();
  });

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(makePostRequest({}))).status).toBe(401);
  });

  it("校验失败返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    schemaParse.mockReturnValue({ success: false, error: { issues: [] } });
    expect((await POST(makePostRequest({}))).status).toBe(400);
  });

  it("成功创建返回 201", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const values = { title: "X" };
    schemaParse.mockReturnValue({ success: true, data: values });
    createMock.mockResolvedValue({ id: "a1", title: "X" });
    const res = await POST(makePostRequest(values));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(values);
  });
});
