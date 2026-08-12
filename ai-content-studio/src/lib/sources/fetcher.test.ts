import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDocument } from "./fetcher";

const pubResolve = () => Promise.resolve(["142.250.0.1"]);

function mockResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDocument", () => {
  it("200 成功：buffer 含正文、finalUrl 同输入", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, "hello body"));
    const r = await fetchDocument("https://example.com/a", { resolve: pubResolve });
    expect(r.status).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.finalUrl).toBe("https://example.com/a");
    expect(new TextDecoder().decode(r.buffer)).toBe("hello body");
  });

  it("重定向手动跟随到最终 URL", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(302, "", { location: "https://example.com/b" }))
      .mockResolvedValueOnce(mockResponse(200, "final"));
    const r = await fetchDocument("https://example.com/a", { resolve: pubResolve });
    expect(r.status).toBe(200);
    expect(r.finalUrl).toBe("https://example.com/b");
    expect(new TextDecoder().decode(r.buffer)).toBe("final");
  });

  it("重定向超过上限 → blocked", async () => {
    fetchMock.mockImplementation(async () => mockResponse(302, "", { location: "https://example.com/loop" }));
    const r = await fetchDocument("https://example.com/a", { resolve: pubResolve, maxRedirects: 2 });
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/重定向超过/);
  });

  it("响应体超 maxBytes → blocked", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, "x".repeat(500)));
    const r = await fetchDocument("https://example.com/a", { resolve: pubResolve, maxBytes: 100 });
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/响应体超过/);
  });

  it("SSRF 解析到私网 IP → blocked", async () => {
    const r = await fetchDocument("https://example.com/a", { resolve: () => Promise.resolve(["10.0.0.1"]) });
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/私有/);
  });

  it("主机黑名单（localhost）→ blocked（不需要 fetch）", async () => {
    const r = await fetchDocument("http://localhost/x");
    expect(r.blocked).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非 http 协议 → blocked", async () => {
    const r = await fetchDocument("ftp://example.com/a");
    expect(r.blocked).toBe(true);
  });
});