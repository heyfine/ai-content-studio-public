import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRobotsCache } from "./robots-check";
import { runFetchPipeline } from "./pipeline";

const mkRobotsFetcher = (status: number, text: string) =>
  vi.fn(async () => ({ status, ok: status >= 200 && status < 300, text }));

const pubResolve = () => Promise.resolve(["142.250.0.1"]);

beforeEach(() => {
  clearRobotsCache();
});

function mockResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

describe("runFetchPipeline", () => {
  it("成功路径：返回 normalizedContent + hash + httpStatus", async () => {
    const html = `<html lang="zh"><head><meta property="og:title" content="T"></head>
      <body><article><p>${"示例正文段落 ".repeat(40)}</p></article></body></html>`;
    const fetchMock = vi.fn(async () => mockResponse(200, html, { "content-type": "text/html; charset=utf-8" }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await runFetchPipeline("https://example.com/a", {
        resolve: pubResolve,
        robotsFetcher: mkRobotsFetcher(404, ""),
      });
      expect(r.kind).toBe("ok");
      if (r.kind === "ok") {
        expect(r.httpStatus).toBe(200);
        expect(r.normalizedContent).toContain("示例正文");
        expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(r.contentType).toContain("text/html");
        expect(r.robotsStatus).toBe("allowed");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("robots disallowed → blocked（不抓取）", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await runFetchPipeline("https://example.com/private", {
        resolve: pubResolve,
        robotsFetcher: mkRobotsFetcher(200, "User-agent: *\nDisallow: /\n"),
      });
      expect(r.kind).toBe("blocked");
      if (r.kind === "blocked") {
        expect(r.fetchStatus).toBe("blocked");
        expect(r.reason).toMatch(/robots disallowed/);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("HTTP 403 → requires_access", async () => {
    const fetchMock = vi.fn(async () => mockResponse(403, "forbidden"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await runFetchPipeline("https://example.com/a", { resolve: pubResolve, robotsFetcher: mkRobotsFetcher(404, "") });
      expect(r.kind).toBe("blocked");
      if (r.kind === "blocked") expect(r.fetchStatus).toBe("requires_access");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("HTTP 500 → failed", async () => {
    const fetchMock = vi.fn(async () => mockResponse(500, "err"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await runFetchPipeline("https://example.com/a", { resolve: pubResolve, robotsFetcher: mkRobotsFetcher(404, "") });
      expect(r.kind).toBe("blocked");
      if (r.kind === "blocked") expect(r.fetchStatus).toBe("failed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("无正文 → failed", async () => {
    const fetchMock = vi.fn(async () => mockResponse(200, "<html><head></head><body></body></html>", { "content-type": "text/html" }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await runFetchPipeline("https://example.com/a", { resolve: pubResolve, robotsFetcher: mkRobotsFetcher(404, "") });
      expect(r.kind).toBe("blocked");
      if (r.kind === "blocked") {
        expect(r.reason).toMatch(/无可提取正文|正文解析失败/);
        expect(r.fetchStatus).toBe("failed");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("SSRF 私网 → blocked", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const r = await runFetchPipeline("https://example.com/a", { resolve: () => Promise.resolve(["10.0.0.1"]), robotsFetcher: mkRobotsFetcher(404, "") });
      expect(r.kind).toBe("blocked");
      if (r.kind === "blocked") expect(r.fetchStatus).toBe("blocked");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});