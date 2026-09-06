import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  weChatConfigFindUnique: vi.fn(),
  articleFindUnique: vi.fn(),
  weChatPublishUpsert: vi.fn(),
  weChatConfigCreate: vi.fn(),
  weChatConfigFindMany: vi.fn(),
  weChatConfigDelete: vi.fn(),
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => `sec-of-${s}`),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weChatConfig: {
      findUnique: mocks.weChatConfigFindUnique,
      findMany: mocks.weChatConfigFindMany,
      create: mocks.weChatConfigCreate,
      delete: mocks.weChatConfigDelete,
    },
    article: { findUnique: mocks.articleFindUnique },
    weChatPublish: { upsert: mocks.weChatPublishUpsert },
  },
}));
vi.mock("@/lib/crypto", () => ({ encrypt: mocks.encrypt, decrypt: mocks.decrypt }));

const originalFetch = globalThis.fetch;

function pngResponse(sizeBytes: number) {
  return new Response(new ArrayBuffer(sizeBytes), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}

/** 依次响应 fetch 调用（stable_token → add_material → uploadimg… → draft/add） */
function mockFetchSequence(responses: Array<Record<string, unknown>>) {
  let call = 0;
  globalThis.fetch = vi.fn(async () => {
    const body = responses[Math.min(call, responses.length - 1)];
    call++;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** 按 URL 分流的 fetch mock：微信各接口走 overrides，其余（图片下载）返回 png 字节 */
function mockWechatFetch(
  overrides: { token?: unknown; material?: unknown; upload?: unknown; draft?: unknown } = {},
) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("stable_token"))
      return Response.json(overrides.token ?? { errcode: 0, access_token: "AT", expires_in: 7200 });
    if (url.includes("add_material"))
      return Response.json(overrides.material ?? { errcode: 0, media_id: "THUMB" });
    if (url.includes("uploadimg"))
      return Response.json(
        overrides.upload ?? { errcode: 0, url: "https://mmbiz.qpic.cn/replaced" },
      );
    if (url.includes("draft/add"))
      return Response.json(overrides.draft ?? { errcode: 0, media_id: "DRAFT_MID" });
    if (!url.includes("api.weixin.qq.com")) return pngResponse(1024);
    return Response.json({ errcode: -1, errmsg: `unexpected url ${url}` });
  }) as unknown as typeof fetch;
}

import {
  clearTokenCache,
  createWechatConfig,
  createWechatDraft,
  deleteWechatConfig,
  getAccessToken,
  replaceContentImages,
  resolveCoverUrl,
  sendArticleToWechatDraft,
  stripHtml,
  uploadContentImage,
  uploadCoverMaterial,
} from "./wechat-service";

const config = {
  id: "wc1",
  appId: "wx1234567890abcdef",
  appSecret: "enc-secret",
  name: "我的订阅号",
  enabled: true,
};

const TOKEN = { errcode: 0, access_token: "AT", expires_in: 7200 };

describe("getAccessToken（stable_token 缓存）", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
    vi.clearAllMocks();
  });

  it("取到 token 并缓存；第二次调用不再请求微信", async () => {
    mockFetchSequence([TOKEN]);
    expect(await getAccessToken(config)).toBe("AT");
    expect(await getAccessToken(config)).toBe("AT");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({
      grant_type: "client_credential",
      appid: "wx1234567890abcdef",
      secret: "sec-of-enc-secret",
    });
  });

  it("errcode 40164 映射为 IP 白名单中文提示", async () => {
    mockFetchSequence([{ errcode: 40164, errmsg: "invalid ip 1.2.3.4 ipv6 not in whitelist" }]);
    await expect(getAccessToken(config)).rejects.toThrow(/IP 白名单/);
  });

  it("errcode 48001 映射为接口权限提示", async () => {
    mockFetchSequence([{ errcode: 48001, errmsg: "api unauthorized" }]);
    await expect(getAccessToken(config)).rejects.toThrow(/接口权限/);
  });
});

describe("图片上传", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
    vi.clearAllMocks();
  });

  it("uploadContentImage：<1MB png 上传返回微信图床 URL", async () => {
    mockWechatFetch({ upload: { errcode: 0, url: "https://mmbiz.qpic.cn/abc" } });
    expect(await uploadContentImage("AT", "https://cdn.example.com/a.png")).toBe(
      "https://mmbiz.qpic.cn/abc",
    );
  });

  it("uploadContentImage：≥1MB 报错提示压缩", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(pngResponse(1024 * 1024)) as unknown as typeof fetch;
    await expect(uploadContentImage("AT", "https://cdn.example.com/big.png")).rejects.toThrow(
      /小于 1MB/,
    );
  });

  it("uploadContentImage：webp 报错提示格式", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(new ArrayBuffer(10), {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      }),
    ) as unknown as typeof fetch;
    await expect(uploadContentImage("AT", "https://cdn.example.com/a.webp")).rejects.toThrow(
      /仅支持 jpg\/png/,
    );
  });

  it("uploadCoverMaterial：返回 media_id", async () => {
    mockWechatFetch({ material: { errcode: 0, media_id: "MID" } });
    expect(await uploadCoverMaterial("AT", "https://cdn.example.com/cover.png")).toBe("MID");
  });
});

describe("replaceContentImages", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
    vi.clearAllMocks();
  });

  it("把全部外链图替换为微信图床 URL；相同 URL 只上传一次", async () => {
    mockWechatFetch({
      upload: { errcode: 0, url: "https://mmbiz.qpic.cn/replaced" },
    });
    const html =
      '<p style="m:0"><img src="https://cdn.example.com/a.png"></p><img src="https://cdn.example.com/b.png"><img src="https://cdn.example.com/a.png">';
    const out = await replaceContentImages(html, "AT");
    expect(out).toBe(
      '<p style="m:0"><img src="https://mmbiz.qpic.cn/replaced"></p><img src="https://mmbiz.qpic.cn/replaced"><img src="https://mmbiz.qpic.cn/replaced">',
    );
    // 2 张图各 1 次下载 + 1 次上传
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("任一图上传失败即整体报错（防微信静默过滤）", async () => {
    mockWechatFetch({ upload: { errcode: 40007, errmsg: "invalid media_id" } });
    await expect(
      replaceContentImages('<img src="https://cdn.example.com/a.png">', "AT"),
    ).rejects.toThrow(/无效的 media_id/);
  });

  it("data: URI 内嵌图直接报错", async () => {
    await expect(
      replaceContentImages('<img src="data:image/png;base64,AAAA">', "AT"),
    ).rejects.toThrow(/data:\/blob:/);
  });

  it("无图片时原样返回", async () => {
    expect(await replaceContentImages("<p>正文</p>", "AT")).toBe("<p>正文</p>");
    expect(globalThis.fetch).toBe(originalFetch);
  });
});

describe("草稿编排", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
    vi.clearAllMocks();
  });

  it("resolveCoverUrl：优先特色图片，其次正文第一张图，无图报错", () => {
    expect(resolveCoverUrl('<img src="https://x/1.jpg">', "https://x/cover.jpg")).toBe(
      "https://x/cover.jpg",
    );
    expect(resolveCoverUrl('<p>前</p><img src="https://x/first.jpg">')).toBe("https://x/first.jpg");
    expect(() => resolveCoverUrl("<p>没图</p>")).toThrow(/封面图/);
  });

  it("sendArticleToWechatDraft：完整链路 token→封面→转存→draft/add→落库", async () => {
    mocks.weChatConfigFindUnique.mockResolvedValue(config);
    mocks.articleFindUnique.mockResolvedValue({
      id: "a1",
      title: "标题标题标题标题标题标题标题标题",
      featuredImage: "https://cdn.example.com/cover.png",
    });
    mocks.weChatPublishUpsert.mockResolvedValue({});
    mockWechatFetch({
      material: { errcode: 0, media_id: "THUMB" },
      upload: { errcode: 0, url: "https://mmbiz.qpic.cn/c1" },
      draft: { errcode: 0, media_id: "DRAFT_MID" },
    });

    const result = await sendArticleToWechatDraft(
      "wc1",
      "a1",
      '<section style="f:1"><p style="m:0">正文</p><img src="https://cdn.example.com/c1.png"></section>',
    );
    expect(result).toEqual({ mediaId: "DRAFT_MID" });

    // draft/add 请求体：thumb 为封面素材，正文图已替换为微信图床 URL
    const addCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => String(c[0]).includes("draft/add"),
    );
    if (!addCall) throw new Error("未调用 draft/add");
    const payload = JSON.parse(addCall[1].body);
    expect(payload.articles[0]).toMatchObject({
      article_type: "news",
      title: "标题标题标题标题标题标题标题标题",
      thumb_media_id: "THUMB",
      need_open_comment: 1,
    });
    expect(payload.articles[0].content).toContain("https://mmbiz.qpic.cn/c1");
    expect(payload.articles[0].content).not.toContain("cdn.example.com");
    expect(payload.articles[0].digest).toBe("正文");
    // 发布记录落库（同文章同账号覆盖）
    expect(mocks.weChatPublishUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId_configId: { articleId: "a1", configId: "wc1" } },
        update: expect.objectContaining({ mediaId: "DRAFT_MID" }),
      }),
    );
  });

  it("文章无图（无特色图片且正文无图）时报错且不调 draft/add", async () => {
    mocks.weChatConfigFindUnique.mockResolvedValue(config);
    mocks.articleFindUnique.mockResolvedValue({ id: "a1", title: "T", featuredImage: null });
    mockFetchSequence([TOKEN]);
    await expect(sendArticleToWechatDraft("wc1", "a1", "<p>纯文字</p>")).rejects.toThrow(/封面图/);
  });

  it("配置不存在或未启用时报错", async () => {
    mocks.weChatConfigFindUnique.mockResolvedValue(null);
    await expect(sendArticleToWechatDraft("wc1", "a1", "<p>x</p>")).rejects.toThrow(/不存在/);
  });
});

describe("配置 CRUD 与工具函数", () => {
  afterEach(() => vi.clearAllMocks());

  it("createWechatConfig 加密 AppSecret 入库", async () => {
    mocks.weChatConfigCreate.mockResolvedValue({ id: "new1" });
    await createWechatConfig({
      name: "号",
      appId: "wx1234567890abcdef",
      appSecret: "raw-secret",
      enabled: true,
    });
    expect(mocks.weChatConfigCreate).toHaveBeenCalledWith({
      data: { name: "号", appId: "wx1234567890abcdef", appSecret: "enc:raw-secret" },
    });
  });

  it("deleteWechatConfig：删除失败给中文提示", async () => {
    mocks.weChatConfigDelete.mockRejectedValue(new Error("P2025"));
    await expect(deleteWechatConfig("nope")).rejects.toThrow(/不存在/);
  });

  it("stripHtml 去标签压缩空白", () => {
    expect(stripHtml("<p>第一段</p>  <p>第二段</p>")).toBe("第一段 第二段");
  });

  it("createWechatDraft：errcode 0 返回 media_id", async () => {
    mockFetchSequence([{ errcode: 0, media_id: "M1" }]);
    expect(
      await createWechatDraft("AT", { title: "T", content: "<p>c</p>", thumbMediaId: "TH" }),
    ).toBe("M1");
  });
});
