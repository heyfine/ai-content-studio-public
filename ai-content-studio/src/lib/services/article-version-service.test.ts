import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  versionCreate: vi.fn(),
  versionFindMany: vi.fn(),
  versionFindFirst: vi.fn(),
  versionDeleteMany: vi.fn(),
  articleFindUnique: vi.fn(),
  articleUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    articleVersion: {
      create: mocks.versionCreate,
      findMany: mocks.versionFindMany,
      findFirst: mocks.versionFindFirst,
      deleteMany: mocks.versionDeleteMany,
    },
    article: { findUnique: mocks.articleFindUnique, update: mocks.articleUpdate },
  },
}));

import {
  deleteVersion,
  getVersion,
  listVersions,
  pruneVersions,
  restoreVersion,
  snapshotBeforeOverwrite,
} from "./article-version-service";

const existing = {
  title: "标题",
  content: "旧正文",
  contentJson: { type: "doc" },
  contentHtml: "<p>旧正文</p>",
  contentMd: "旧正文",
};

describe("snapshotBeforeOverwrite", () => {
  beforeEach(() => {
    mocks.versionCreate.mockReset();
    mocks.versionFindMany.mockReset();
    mocks.versionDeleteMany.mockReset();
  });

  it("content 变化时存档旧状态（source 透传）", async () => {
    mocks.versionCreate.mockResolvedValue({});
    mocks.versionFindMany.mockResolvedValue([]);
    await snapshotBeforeOverwrite("a1", existing, { content: "新正文" }, "save");
    expect(mocks.versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        articleId: "a1",
        title: "标题",
        content: "旧正文",
        source: "save",
        size: 3,
      }),
    });
  });

  it("contentMd 单独变化也触发存档", async () => {
    mocks.versionCreate.mockResolvedValue({});
    mocks.versionFindMany.mockResolvedValue([]);
    await snapshotBeforeOverwrite("a1", existing, { contentMd: "只改了 md" }, "sync");
    expect(mocks.versionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.versionCreate.mock.calls[0][0].data.source).toBe("sync");
  });

  it("内容未变化时不存档（含仅改标题的情况）", async () => {
    await snapshotBeforeOverwrite("a1", existing, { content: "旧正文" }, "save");
    await snapshotBeforeOverwrite("a1", existing, { title: "新标题" }, "save");
    expect(mocks.versionCreate).not.toHaveBeenCalled();
  });
});

describe("pruneVersions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("超出保留数时删除更早的版本", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => ({ id: `v${i}` }));
    mocks.versionFindMany.mockResolvedValue(ids);
    mocks.versionDeleteMany.mockResolvedValue({ count: 1 });
    await pruneVersions("a1");
    expect(mocks.versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, orderBy: { createdAt: "desc" } }),
    );
    expect(mocks.versionDeleteMany).toHaveBeenCalled();
  });

  it("未超限时不删除", async () => {
    mocks.versionFindMany.mockResolvedValue([{ id: "v1" }]);
    await pruneVersions("a1");
    expect(mocks.versionDeleteMany).not.toHaveBeenCalled();
  });
});

describe("list/get/restore/delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listVersions 不含正文字段", async () => {
    mocks.versionFindMany.mockResolvedValue([]);
    await listVersions("a1");
    expect(mocks.versionFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      title: true,
      source: true,
      size: true,
      createdAt: true,
    });
  });

  it("getVersion 按 articleId+versionId 查", async () => {
    mocks.versionFindFirst.mockResolvedValue({ id: "v1", content: "x" });
    const v = await getVersion("a1", "v1");
    expect(v?.content).toBe("x");
    expect(mocks.versionFindFirst).toHaveBeenCalledWith({
      where: { id: "v1", articleId: "a1" },
    });
  });

  it("restoreVersion：版本不存在报错", async () => {
    mocks.versionFindFirst.mockResolvedValue(null);
    await expect(restoreVersion("a1", "v9")).rejects.toThrow("版本不存在");
  });

  it("restoreVersion：把版本内容写回文章（source=restore）", async () => {
    mocks.versionFindFirst.mockResolvedValue({
      id: "v1",
      title: "旧标题",
      content: "旧正文",
      contentJson: { type: "doc" },
      contentHtml: "<p>旧正文</p>",
      contentMd: "旧正文",
    });
    mocks.articleFindUnique.mockResolvedValue({
      title: "当前标题",
      content: "当前正文",
      contentJson: null,
      contentHtml: null,
      contentMd: null,
      status: "DRAFT",
    });
    mocks.articleUpdate.mockResolvedValue({});
    mocks.versionCreate.mockResolvedValue({});
    mocks.versionFindMany.mockResolvedValue([]);
    await restoreVersion("a1", "v1");
    expect(mocks.articleUpdate).toHaveBeenCalled();
    // 恢复前当前状态先被存档
    expect(mocks.versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: "当前正文", source: "restore" }),
    });
  });

  it("deleteVersion：删 0 行报不存在", async () => {
    mocks.versionDeleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteVersion("a1", "v9")).rejects.toThrow("版本不存在");
  });
});
