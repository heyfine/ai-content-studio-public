import { describe, it, expect, vi, beforeEach } from "vitest";

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
  listArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  slugify,
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

  it("listArticles 无 status 不带 where", async () => {
    findMany.mockResolvedValue([]);
    await listArticles();
    expect(findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: "desc" } });
  });

  it("listArticles 带 status 过滤", async () => {
    findMany.mockResolvedValue([]);
    await listArticles("PUBLISHED");
    expect(findMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
    });
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
});
