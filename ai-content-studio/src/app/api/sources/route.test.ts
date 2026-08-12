import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ingestSource: vi.fn(),
  listSources: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/source-service", () => ({
  ingestSource: mocks.ingestSource,
  listSources: mocks.listSources,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { GET, POST } from "./route";

function mkReq(method: string, url: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

describe("GET /api/sources", () => {
  it("未授权 → 401", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const r = await GET(mkReq("GET", "http://localhost/api/sources"));
    expect(r.status).toBe(401);
  });
  it("无筛选列表 → 200", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.listSources.mockResolvedValueOnce([]);
    const r = await GET(mkReq("GET", "http://localhost/api/sources"));
    expect(r.status).toBe(200);
    expect(mocks.listSources).toHaveBeenCalledOnce();
  });
  it("domain + status 筛选传参", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.listSources.mockResolvedValueOnce([]);
    await GET(mkReq("GET", "http://localhost/api/sources?domain=ex.com&status=fetched"));
    expect(mocks.listSources.mock.calls[0][0]).toEqual({ domain: "ex.com", status: "fetched" });
  });
  it("非法 status → 400", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    const r = await GET(mkReq("GET", "http://localhost/api/sources?status=bad"));
    expect(r.status).toBe(400);
  });
});

describe("POST /api/sources", () => {
  it("未授权 → 401", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const r = await POST(mkReq("POST", "http://localhost/api/sources", { url: "https://x.com" }));
    expect(r.status).toBe(401);
  });
  it("缺 url → 400", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    const r = await POST(mkReq("POST", "http://localhost/api/sources", {}));
    expect(r.status).toBe(400);
  });
  it("新建成功 → 201", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.ingestSource.mockResolvedValueOnce({ source: { id: "s1" }, created: true, versionBumped: true, versionNumber: 1 });
    const r = await POST(mkReq("POST", "http://localhost/api/sources", { url: "https://example.com/a" }));
    expect(r.status).toBe(201);
    expect(mocks.ingestSource.mock.calls[0][0]).toBe("https://example.com/a");
  });
  it("去重命中 → 200（不新建）", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.ingestSource.mockResolvedValueOnce({ source: { id: "s1" }, created: false, versionBumped: false, versionNumber: 0 });
    const r = await POST(mkReq("POST", "http://localhost/api/sources", { url: "https://example.com/a" }));
    expect(r.status).toBe(200);
  });
  it("service 抛 URL 校验错 → 400", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { name: "a" } });
    mocks.ingestSource.mockRejectedValueOnce(new Error("仅支持 http/https 协议"));
    const r = await POST(mkReq("POST", "http://localhost/api/sources", { url: "ftp://x" }));
    expect(r.status).toBe(400);
  });
});