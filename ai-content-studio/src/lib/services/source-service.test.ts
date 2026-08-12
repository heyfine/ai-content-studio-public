import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const source = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const sourceVersion = {
    findMany: vi.fn(),
    create: vi.fn(),
  };
  const transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
  return { source, sourceVersion, transaction };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    source: mocks.source,
    sourceVersion: mocks.sourceVersion,
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/sources/pipeline", () => ({
  runFetchPipeline: vi.fn(),
}));

import { runFetchPipeline } from "@/lib/sources/pipeline";
import { deleteSource, getSource, ingestSource, listSources, refreshSource } from "./source-service";

function mkOk(overrides: Record<string, unknown> = {}) {
  return {
    kind: "ok" as const,
    html: "<html></html>",
    parsed: {
      title: "示例标题",
      excerpt: "摘要",
      byline: "张三",
      length: 500,
      content: "<p>正文</p>",
      textContent: "正文 ".repeat(120),
      meta: {
        title: "示例标题",
        description: "示例描述",
        canonical: undefined,
        author: "张三",
        publishedTime: "2026-08-12T00:00:00Z",
        lang: "zh",
        siteName: "示例站",
        ogType: "article",
      },
    },
    normalizedContent: "正文 ".repeat(120).trim(),
    hash: "hash-aaa",
    finalUrl: "https://example.com/article",
    httpStatus: 200,
    contentType: "text/html; charset=utf-8",
    robotsStatus: "allowed" as const,
    ...overrides,
  };
}

function mkBlocked(fetchStatus: "blocked" | "requires_access" | "failed", overrides: Record<string, unknown> = {}) {
  return {
    kind: "blocked" as const,
    reason: `阻断理由：${fetchStatus}`,
    fetchStatus,
    robotsStatus: "unknown" as const,
    httpStatus: fetchStatus === "failed" ? 500 : undefined,
    ...overrides,
  };
}

function mkSourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "src-1",
    url: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    domain: "example.com",
    title: "示例标题",
    description: null,
    author: null,
    publisher: null,
    publishedAt: null,
    language: null,
    sourceType: "unknown",
    licenseType: "unknown",
    copyrightStatus: "unknown",
    robotsStatus: "allowed",
    fetchStatus: "parsed",
    httpStatus: 200,
    contentType: "text/html",
    contentHash: "hash-aaa",
    wordCount: 120,
    normalizedContent: "正文",
    metadataJson: {},
    fetchError: null,
    fetchedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (runFetchPipeline as ReturnType<typeof vi.fn>).mockReset();
});

describe("ingestSource", () => {
  it("新建：无现有 Source + 成功抓取 → 创建 Source 与 v1 版本", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(null);
    mocks.source.create.mockResolvedValueOnce(mkSourceRow({ id: "new-id" }));
    vi.mocked(runFetchPipeline).mockResolvedValueOnce(mkOk());
    const r = await ingestSource("https://example.com/article");
    expect(r.created).toBe(true);
    expect(r.versionBumped).toBe(true);
    expect(r.versionNumber).toBe(1);
    expect(mocks.source.create).toHaveBeenCalledOnce();
    const createArg = mocks.source.create.mock.calls[0][0];
    expect(createArg.data.url).toBe("https://example.com/article");
    expect(createArg.data.versions.create[0].versionNumber).toBe(1);
  });

  it("去重命中：相同 contentHash → 仅 update，不新增版本", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(mkSourceRow({ contentHash: "hash-aaa", id: "exist-id" }));
    mocks.source.update.mockResolvedValueOnce(mkSourceRow({ id: "exist-id" }));
    vi.mocked(runFetchPipeline).mockResolvedValueOnce(mkOk({ hash: "hash-aaa" }));
    const r = await ingestSource("https://example.com/article");
    expect(r.created).toBe(false);
    expect(r.versionBumped).toBe(false);
    expect(mocks.source.create).not.toHaveBeenCalled();
    expect(mocks.sourceVersion.create).not.toHaveBeenCalled();
    expect(mocks.source.update).toHaveBeenCalledOnce();
  });

  it("内容变化：contentHash 不同 → update + 新版本（versionNumber 自增）", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(mkSourceRow({ contentHash: "hash-old" }));
    mocks.sourceVersion.findMany.mockResolvedValueOnce([{ versionNumber: 3 }]);
    mocks.source.findUnique.mockResolvedValueOnce(mkSourceRow({ contentHash: "hash-new" }));
    vi.mocked(runFetchPipeline).mockResolvedValueOnce(mkOk({ hash: "hash-new" }));
    const r = await ingestSource("https://example.com/article");
    expect(r.versionBumped).toBe(true);
    expect(r.versionNumber).toBe(4);
    expect(mocks.sourceVersion.create).toHaveBeenCalledOnce();
    expect(mocks.sourceVersion.create.mock.calls[0][0].data.versionNumber).toBe(4);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("SSRF/Robots 阻断 + 无现有 Source → 创建 blocked 记录", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(null);
    mocks.source.create.mockResolvedValueOnce(mkSourceRow({ fetchStatus: "blocked", contentHash: null }));
    vi.mocked(runFetchPipeline).mockResolvedValueOnce(mkBlocked("blocked"));
    const r = await ingestSource("https://example.com/a");
    expect(r.created).toBe(true);
    expect(r.versionBumped).toBe(false);
    expect(mocks.source.create).toHaveBeenCalledOnce();
  });

  it("HTTP 403 + 无现有 Source → 创建 requires_access 记录", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(null);
    mocks.source.create.mockResolvedValueOnce(mkSourceRow({ fetchStatus: "requires_access", httpStatus: 403 as unknown as number }));
    vi.mocked(runFetchPipeline).mockResolvedValueOnce(mkBlocked("requires_access", { httpStatus: 403 }));
    const r = await ingestSource("https://example.com/a");
    expect(r.created).toBe(true);
    const createArg = mocks.source.create.mock.calls[0][0];
    expect(createArg.data.fetchStatus).toBe("requires_access");
  });

  it("非法 URL 抛错", async () => {
    await expect(ingestSource("not a url")).rejects.toThrow(/URL|格式不合法/);
  });
});

describe("getSource", () => {
  it("返回含 versions 的 Source", async () => {
    const row = { ...mkSourceRow(), versions: [{ versionNumber: 1 }] };
    mocks.source.findUnique.mockResolvedValueOnce(row);
    const r = await getSource("src-1");
    expect(r?.id).toBe("src-1");
    expect(r?.versions).toHaveLength(1);
  });
  it("不存在返回 null", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(null);
    expect(await getSource("x")).toBeNull();
  });
});

describe("listSources", () => {
  it("无筛选：findMany where 空", async () => {
    mocks.source.findMany.mockResolvedValueOnce([mkSourceRow()]);
    const r = await listSources();
    expect(r).toHaveLength(1);
    const arg = mocks.source.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
  });
  it("按 domain + status 筛选", async () => {
    mocks.source.findMany.mockResolvedValueOnce([]);
    await listSources({ domain: "ex.com", status: "parsed" });
    expect(mocks.source.findMany.mock.calls[0][0].where).toEqual({ domain: "ex.com", fetchStatus: "parsed" });
  });
});

describe("refreshSource", () => {
  it("不存在抛错", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(null);
    await expect(refreshSource("nope")).rejects.toThrow(/不存在/);
  });
  it("相同 hash → 仅 update、不 bump", async () => {
    mocks.source.findUnique.mockResolvedValueOnce(mkSourceRow({ contentHash: "same" }));
    mocks.source.update.mockResolvedValueOnce(mkSourceRow({ contentHash: "same" }));
    vi.mocked(runFetchPipeline).mockResolvedValueOnce(mkOk({ hash: "same" }));
    const r = await refreshSource("src-1");
    expect(r.versionBumped).toBe(false);
    expect(mocks.sourceVersion.create).not.toHaveBeenCalled();
  });
});

describe("deleteSource", () => {
  it("调用 prisma.source.delete", async () => {
    mocks.source.delete.mockResolvedValueOnce(mkSourceRow());
    await deleteSource("src-1");
    expect(mocks.source.delete.mock.calls[0][0]).toEqual({ where: { id: "src-1" } });
  });
});