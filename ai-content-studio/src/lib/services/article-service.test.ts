import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, findUnique, create, update, del } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { article: { findMany, findUnique, create, update, delete: del } },
}));

import {
  createArticle,
  deleteArticle,
  listArticles,
  listTrashedArticles,
  purgeArticle,
  restoreArticle,
  slugify,
  trashArticle,
  updateArticle,
} from "./article-service";

describe("slugify", () => {
  it("英文标题转 slug", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });
  it("中文标题保留中文字符", () => {
    expect(slugify("Next.js 入门教程")).toBe("next-js-入门教程");
  });
  it("纯符号为 untitled", () => {
    expect(slugify("!!!")).toBe("untitled");
  });
  it("去首尾连字符", () => {
    expect(slugify("  --a b--  ")).toBe("a-b");
  });
});

describe("article-service", () => {
  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    create.mockReset();
    update.mockReset();
    del.mockReset();
  });

  it("listArticles 无 status 默认排除已删除（deletedAt: null）", async () => {
    findMany.mockResolvedValue([]);
    await listArticles();
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { publishes: { select: { configId: true, wpUrl: true, wpPostId: true } } },
    });
  });

  it("listArticles 带 status 过滤且排除已删除", async () => {
    findMany.mockResolvedValue([]);
    await listArticles("PUBLISHED");
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      include: { publishes: { select: { configId: true, wpUrl: true, wpPostId: true } } },
    });
  });

  it("listArticles includeTrashed=true 不过滤 deletedAt", async () => {
    findMany.mockResolvedValue([]);
    await listArticles(undefined, true);
    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { updatedAt: "desc" },
      include: { publishes: { select: { configId: true, wpUrl: true, wpPostId: true } } },
    });
  });

  it("listTrashedArticles 只查 deletedAt 非空", async () => {
    findMany.mockResolvedValue([]);
    await listTrashedArticles();
    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null } },
      orderBy: { updatedAt: "desc" },
      include: { publishes: { select: { configId: true, wpUrl: true, wpPostId: true } } },
    });
  });

  it("trashArticle 写入 deletedAt", async () => {
    update.mockResolvedValue({ id: "a1", deletedAt: new Date() });
    await trashArticle("a1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("restoreArticle 清空 deletedAt", async () => {
    update.mockResolvedValue({ id: "a1", deletedAt: null });
    await restoreArticle("a1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { deletedAt: null },
    });
  });

  it("purgeArticle 永久删除透传 id", async () => {
    del.mockResolvedValue({ id: "a1" });
    await purgeArticle("a1");
    expect(del).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("createArticle 自动生成 slug 且默认 DRAFT", async () => {
    create.mockResolvedValue({ id: "a1" });
    await createArticle({ title: "Hello World" });
    expect(create).toHaveBeenCalledWith({
      data: {
        title: "Hello World",
        slug: "hello-world",
        content: "",
        status: "DRAFT",
        seoScore: undefined,
        wpPostId: undefined,
        promptId: undefined,
      },
    });
  });

  it("createArticle 显式 slug 优先", async () => {
    create.mockResolvedValue({ id: "a1" });
    await createArticle({ title: "X", slug: "my-slug" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "my-slug" }) }),
    );
  });

  it("updateArticle 不存在抛错", async () => {
    findUnique.mockResolvedValue(null);
    await expect(updateArticle("nope", { title: "Y" })).rejects.toThrow("文章不存在");
  });

  it("updateArticle 合法状态转换通过", async () => {
    findUnique.mockResolvedValue({ id: "a1", status: "DRAFT", content: "", version: 1 });
    update.mockResolvedValue({ id: "a1", status: "REVIEW" });
    await updateArticle("a1", { status: "REVIEW" });
    expect(update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "REVIEW" } });
  });

  it("updateArticle 非法状态转换抛错", async () => {
    findUnique.mockResolvedValue({ id: "a1", status: "ARCHIVED", content: "", version: 1 });
    await expect(updateArticle("a1", { status: "PUBLISHED" })).rejects.toThrow(/非法状态转换/);
    expect(update).not.toHaveBeenCalled();
  });

  it("updateArticle 同状态不触发转换校验（直接写）", async () => {
    findUnique.mockResolvedValue({ id: "a1", status: "DRAFT", content: "", version: 1 });
    update.mockResolvedValue({ id: "a1" });
    await updateArticle("a1", { status: "DRAFT", title: "新标题" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { status: "DRAFT", title: "新标题" },
    });
  });

  it("deleteArticle 透传 id", async () => {
    del.mockResolvedValue({ id: "a1" });
    await deleteArticle("a1");
    expect(del).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("createArticle 带 Tiptap 三字段（contentJson/Html/Md）", async () => {
    create.mockResolvedValue({ id: "a1" });
    const json = { type: "doc", content: [] };
    await createArticle({
      title: "Tiptap 文章",
      content: ':::callout{type="info"}\n内容\n:::',
      contentJson: json,
      contentHtml: "<p>内容</p>",
      contentMd: ':::callout{type="info"}\n内容\n:::',
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Tiptap 文章",
        contentJson: json,
        contentHtml: "<p>内容</p>",
        contentMd: ':::callout{type="info"}\n内容\n:::',
      }),
    });
  });

  it("createArticle 不带新字段时 payload 不含它们（兼容旧调用）", async () => {
    create.mockResolvedValue({ id: "a1" });
    await createArticle({ title: "X" });
    expect(create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({
        contentJson: expect.anything(),
        contentHtml: expect.anything(),
        contentMd: expect.anything(),
      }),
    });
  });

  it("updateArticle 写入 Tiptap 三字段", async () => {
    findUnique.mockResolvedValue({ id: "a1", status: "DRAFT", content: "", version: 1 });
    update.mockResolvedValue({ id: "a1" });
    const json = { type: "doc", content: [] };
    await updateArticle("a1", {
      content: "# 标题",
      contentJson: json,
      contentHtml: "<h1>标题</h1>",
      contentMd: "# 标题",
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: {
        content: "# 标题",
        contentJson: json,
        contentHtml: "<h1>标题</h1>",
        contentMd: "# 标题",
      },
    });
  });
});
