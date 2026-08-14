import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  configFindUnique: vi.fn(),
  configUpdate: vi.fn(),
  configDelete: vi.fn(),
  create: vi.fn(),
  articleFindUnique: vi.fn(),
  articleUpdate: vi.fn(),
  encrypt: vi.fn((s: string) => "encrypted:" + s),
  decrypt: vi.fn((s: string) => "decrypted:" + s),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wordPressConfig: {
      findFirst: mocks.findFirst,
      findUnique: mocks.configFindUnique,
      update: mocks.configUpdate,
      delete: mocks.configDelete,
      create: mocks.create,
    },
    article: {
      findUnique: mocks.articleFindUnique,
      update: mocks.articleUpdate,
    },
  },
}));
vi.mock("@/lib/crypto", () => ({ encrypt: mocks.encrypt, decrypt: mocks.decrypt }));

const originalFetch = globalThis.fetch;
function mockFetch(response: unknown, ok = true, status = 200) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(response), {
        status: ok ? status : 400,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

import {
  getActiveConfig,
  createWordpressConfig,
  updateWordpressConfig,
  deleteWordpressConfig,
  publishPost,
  publishArticle,
  publishRawContent,
  unpublishArticle,
  trashWordPressPost,
  untrashWordPressPost,
} from "./wordpress-service";

const config = {
  id: "c1",
  siteUrl: "https://blog.example.com",
  username: "admin",
  appPassword: "enc-app-pwd",
  enabled: true,
};

describe("wordpress-service", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getActiveConfig", () => {
    beforeEach(() => {
      mocks.findFirst.mockReset();
      mocks.configFindUnique.mockReset();
    });
    it("指定 configId 时按 id 取并校验 enabled", async () => {
      mocks.configFindUnique.mockResolvedValue(config);
      const c = await getActiveConfig("c1");
      expect(c).toEqual(config);
    });
    it("未指定时取首个启用配置", async () => {
      mocks.findFirst.mockResolvedValue(config);
      const c = await getActiveConfig();
      expect(c.id).toBe("c1");
    });
    it("无可用配置抛错", async () => {
      mocks.findFirst.mockResolvedValue(null);
      await expect(getActiveConfig()).rejects.toThrow(/未配置/);
    });
    it("指定 id 不存在或禁用抛错", async () => {
      mocks.configFindUnique.mockResolvedValue(null);
      await expect(getActiveConfig("x")).rejects.toThrow(/不可用/);
    });
  });

  describe("createWordpressConfig", () => {
    beforeEach(() => mocks.create.mockReset());
    it("去掉 siteUrl 末尾斜杠、appPassword 加密入库", async () => {
      mocks.create.mockResolvedValue({ id: "c2" });
      await createWordpressConfig({
        name: "博客",
        siteUrl: "https://blog.example.com/",
        username: "admin",
        appPassword: "enc",
      });
      expect(mocks.encrypt).toHaveBeenCalledWith("enc");
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            siteUrl: "https://blog.example.com",
            appPassword: "encrypted:enc",
            enabled: true,
          }),
        }),
      );
    });
  });

  describe("updateWordpressConfig / deleteWordpressConfig", () => {
    beforeEach(() => {
      mocks.configUpdate.mockReset();
      mocks.configDelete.mockReset();
    });
    it("只更新传入字段；appPassword 传入则加密", async () => {
      mocks.configUpdate.mockResolvedValue({ id: "c1" });
      await updateWordpressConfig("c1", { name: "新名字", enabled: false });
      expect(mocks.configUpdate).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { name: "新名字", enabled: false },
      });
      await updateWordpressConfig("c1", { appPassword: "newpwd" });
      expect(mocks.configUpdate).toHaveBeenLastCalledWith({
        where: { id: "c1" },
        data: { appPassword: "encrypted:newpwd" },
      });
    });
    it("删除按 id", async () => {
      mocks.configDelete.mockResolvedValue({ id: "c1" });
      await deleteWordpressConfig("c1");
      expect(mocks.configDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
    });
  });

  describe("publishPost", () => {
    beforeEach(() => {
      globalThis.fetch = originalFetch;
    });
    it("新建：POST /wp-json/wp/v2/posts 携带 Basic Auth", async () => {
      mockFetch({ id: 42, link: "https://blog.example.com/?p=42", status: "publish" });
      const r = await publishPost(
        { siteUrl: "https://blog.example.com", username: "admin", appPassword: "enc-app-pwd" },
        { title: "标题", content: "正文", status: "publish" },
      );
      expect(r).toEqual({ id: 42, link: "https://blog.example.com/?p=42", status: "publish" });
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(called[0]).toBe("https://blog.example.com/wp-json/wp/v2/posts");
      expect(called[1].method).toBe("POST");
      expect(called[1].headers.Authorization).toContain("Basic ");
      expect(Buffer.from(called[1].headers.Authorization.slice(6), "base64").toString()).toBe(
        "admin:decrypted:enc-app-pwd",
      );
      expect(JSON.parse(called[1].body)).toEqual({
        title: "标题",
        content: "正文",
        status: "publish",
      });
    });
    it("更新：有 wpPostId 时走 PUT /posts/:id", async () => {
      mockFetch({ id: 7, link: "https://blog.example.com/?p=7", status: "draft" });
      await publishPost(
        { siteUrl: "https://blog.example.com", username: "admin", appPassword: "enc" },
        { title: "t", content: "c", status: "draft" },
        "7",
      );
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(called[0]).toBe("https://blog.example.com/wp-json/wp/v2/posts/7");
      expect(called[1].method).toBe("PUT");
    });
    it("WP 返回非 2xx 抛错含状态与 message", async () => {
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "rest_cookie_disabled" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as typeof fetch;
      await expect(
        publishPost(
          { siteUrl: "https://blog.example.com", username: "admin", appPassword: "enc" },
          { title: "t", content: "c", status: "publish" },
        ),
      ).rejects.toThrow(/403.*rest_cookie_disabled/);
    });
  });

  describe("publishArticle", () => {
    beforeEach(() => {
      mocks.findFirst.mockReset();
      mocks.articleFindUnique.mockReset();
      mocks.articleUpdate.mockReset();
      globalThis.fetch = originalFetch;
    });
    it("PUBLISHED 文章默认 wpStatus=publish，调 WP 后回填 wpPostId", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({
        id: "a1",
        title: "标题",
        content: "正文",
        status: "PUBLISHED",
        wpPostId: null,
      });
      mockFetch({ id: 100, link: "https://blog.example.com/?p=100", status: "publish" });
      const r = await publishArticle("a1");
      expect(r.wpPostId).toBe("100");
      expect(r.link).toContain("p=100");
      expect(mocks.articleUpdate).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { wpPostId: "100" },
      });
    });
    it("DRAFT 文章默认 wpStatus=draft", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({
        id: "a1",
        title: "t",
        content: "c",
        status: "DRAFT",
        wpPostId: null,
      });
      mockFetch({ id: 1, link: "l", status: "draft" });
      await publishArticle("a1");
      const body = JSON.parse(
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body.status).toBe("draft");
    });
    it("已有 wpPostId 走更新", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({
        id: "a1",
        title: "t",
        content: "c",
        status: "PUBLISHED",
        wpPostId: "55",
      });
      mockFetch({ id: 55, link: "l2", status: "publish" });
      await publishArticle("a1");
      const url = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain("/posts/55");
    });
    it("文章不存在抛错", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue(null);
      await expect(publishArticle("x")).rejects.toThrow("文章不存在");
    });
    it("显式 wpStatus 覆盖映射", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({
        id: "a1",
        title: "t",
        content: "c",
        status: "PUBLISHED",
        wpPostId: null,
      });
      mockFetch({ id: 9, link: "l", status: "draft" });
      await publishArticle("a1", undefined, "draft");
      const body = JSON.parse(
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body.status).toBe("draft");
    });
  });

  describe("publishRawContent", () => {
    beforeEach(() => {
      mocks.findFirst.mockReset();
      globalThis.fetch = originalFetch;
    });
    it("直接按标题+内容调 WP 发布，默认 publish，articleId 为 null", async () => {
      mocks.configFindUnique.mockResolvedValue(config);
      mockFetch({ id: 66, link: "https://blog.example.com/?p=66", status: "publish" });
      const r = await publishRawContent("标题", "正文", "c1");
      expect(r).toEqual({
        wpPostId: "66",
        link: "https://blog.example.com/?p=66",
        status: "publish",
        articleId: null,
      });
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(called[0]).toBe("https://blog.example.com/wp-json/wp/v2/posts");
      const body = JSON.parse(called[1].body);
      expect(body.title).toBe("标题");
      expect(body.status).toBe("publish");
      // Markdown + 高亮块 → 安全 HTML（含 <style>），不把 :::callout 原语法发上博客
      expect(body.content).toContain("<p>正文</p>");
      expect(body.content).toContain("<style>");
    });
    it("显式 wpStatus=draft 时按草稿发布", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mockFetch({ id: 67, link: "l", status: "draft" });
      await publishRawContent("t", "c", undefined, "draft");
      const body = JSON.parse(
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      expect(body.status).toBe("draft");
    });
  });

  describe("unpublishArticle", () => {
    beforeEach(() => {
      mocks.findFirst.mockReset();
      mocks.articleFindUnique.mockReset();
      mocks.articleUpdate.mockReset();
      globalThis.fetch = originalFetch;
    });
    it("DELETE /posts/:id?force=true 并清空 wpPostId", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({
        id: "a1",
        title: "t",
        content: "c",
        status: "PUBLISHED",
        wpPostId: "8",
      });
      mockFetch({ deleted: true });
      const r = await unpublishArticle("a1");
      expect(r.deleted).toBe(true);
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(called[0]).toContain("/posts/8?force=true");
      expect(called[1].method).toBe("DELETE");
      expect(mocks.articleUpdate).toHaveBeenCalledWith({
        where: { id: "a1" },
        data: { wpPostId: null },
      });
    });
    it("无 wpPostId 抛错", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", wpPostId: null });
      await expect(unpublishArticle("a1")).rejects.toThrow(/尚未发布/);
    });
    it("404 视为已删（幂等），仍清空本地", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", wpPostId: "8" });
      globalThis.fetch = vi.fn(
        async () => new Response("not found", { status: 404 }),
      ) as unknown as typeof fetch;
      const r = await unpublishArticle("a1");
      expect(r.deleted).toBe(true);
      expect(mocks.articleUpdate).toHaveBeenCalled();
    });
    it("其它 WP 错误抛出", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", wpPostId: "8" });
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as typeof fetch;
      await expect(unpublishArticle("a1")).rejects.toThrow(/403.*forbidden/);
    });
  });

  describe("trashWordPressPost", () => {
    beforeEach(() => {
      mocks.findFirst.mockReset();
      mocks.articleFindUnique.mockReset();
      globalThis.fetch = originalFetch;
    });
    it("PUT /posts/:id 且 body.status=trash，返回 trashed=true", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", title: "t", content: "c", wpPostId: "9" });
      mockFetch({ id: 9, status: "trash" });
      const r = await trashWordPressPost("a1", "c1");
      expect(r).toEqual({ trashed: true, trashStatus: "trash" });
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(called[0]).toContain("/posts/9");
      expect(called[1].method).toBe("PUT");
      expect(JSON.parse(called[1].body).status).toBe("trash");
    });
    it("无 wpPostId 抛错", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", wpPostId: null });
      await expect(trashWordPressPost("a1", "c1")).rejects.toThrow(/尚未同步/);
    });
    it("WP 非 2xx 抛错", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", wpPostId: "9" });
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "no permission" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as typeof fetch;
      await expect(trashWordPressPost("a1", "c1")).rejects.toThrow(/403.*no permission/);
    });
  });

  describe("untrashWordPressPost", () => {
    beforeEach(() => {
      mocks.findFirst.mockReset();
      mocks.articleFindUnique.mockReset();
      globalThis.fetch = originalFetch;
    });
    it("PUT /posts/:id 恢复 status=publish（默认）", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", title: "t", content: "c", wpPostId: "9" });
      mockFetch({ id: 9, status: "publish" });
      const r = await untrashWordPressPost("a1", "c1");
      expect(r).toEqual({ trashed: false, trashStatus: "publish" });
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(called[1].body).status).toBe("publish");
    });
    it("指定 draft 时恢复为 draft", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", title: "t", content: "c", wpPostId: "9" });
      mockFetch({ id: 9, status: "draft" });
      await untrashWordPressPost("a1", "c1", "draft");
      const called = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(called[1].body).status).toBe("draft");
    });
    it("无 wpPostId 抛错", async () => {
      mocks.findFirst.mockResolvedValue(config);
      mocks.articleFindUnique.mockResolvedValue({ id: "a1", wpPostId: null });
      await expect(untrashWordPressPost("a1", "c1")).rejects.toThrow(/尚未同步/);
    });
  });
});
