import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  weChatConfigFindUnique: vi.fn(),
  articleFindUnique: vi.fn(),
  weChatPublishUpsert: vi.fn(),
  weChatConfigCreate: vi.fn(),
  weChatConfigFindMany: vi.fn(),
  weChatConfigDelete: vi.fn(),
  weChatConfigUpdate: vi.fn(),
  readStorageObject: vi.fn(),
  readLocalImage: vi.fn(),
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
      update: mocks.weChatConfigUpdate,
    },
    article: { findUnique: mocks.articleFindUnique },
    weChatPublish: { upsert: mocks.weChatPublishUpsert },
  },
}));
vi.mock("@/lib/crypto", () => ({ encrypt: mocks.encrypt, decrypt: mocks.decrypt }));
vi.mock("@/lib/services/storage-service", () => ({ readStorageObject: mocks.readStorageObject }));
vi.mock("@/lib/services/image-upload-service", () => ({ readLocalImage: mocks.readLocalImage }));

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
  updateWechatDefaultCover,
  uploadContentImage,
  uploadCoverMaterial,
} from "./wechat-service";

const config = {
  id: "wc1",
  appId: "wx1234567890abcdef",
  appSecret: "enc-secret",
  name: "我的订阅号",
  defaultCoverUrl: null,
  defaultCoverMediaId: null,
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

  it("上传文件名带扩展名（微信 40005：靠文件名扩展名识别类型）", async () => {
    let filename = "";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = init?.body as FormData | undefined;
      if (body instanceof FormData) {
        filename = (body.get("media") as File).name;
        return Response.json({ errcode: 0, url: "https://mmbiz.qpic.cn/x" });
      }
      return pngResponse(1024);
    }) as unknown as typeof fetch;
    await uploadContentImage("AT", "https://cdn.example.com/a.png");
    expect(filename).toBe("image.png");
  });

  it("imageExtForType：png→png、jpeg→jpg", async () => {
    const { imageExtForType } = await import("./wechat-service");
    expect(imageExtForType("image/png")).toBe("png");
    expect(imageExtForType("image/jpeg")).toBe("jpg");
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

describe("replaceContentImages（站内相对路径图）", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
    vi.clearAllMocks();
  });

  it("/api/storage/object/ 站内对象图：SDK 直读转存（key 已解码），不对相对路径发起 HTTP fetch", async () => {
    mocks.readStorageObject.mockResolvedValue({
      bytes: new Uint8Array(1024),
      contentType: "image/png",
    });
    mockWechatFetch({ upload: { errcode: 0, url: "https://mmbiz.qpic.cn/acs" } });
    const out = await replaceContentImages('<img src="/api/storage/object/acs%2Fx.png">', "AT");
    expect(out).toBe('<img src="https://mmbiz.qpic.cn/acs">');
    expect(mocks.readStorageObject).toHaveBeenCalledWith("acs/x.png");
    // 全部 fetch 调用都应指向微信 API（修复点：相对路径不再交给 fetch）
    for (const call of (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).toContain("api.weixin.qq.com");
    }
  });

  it("/uploads/ 本地图：直读文件转存", async () => {
    mocks.readLocalImage.mockResolvedValue({
      bytes: new Uint8Array(1024),
      contentType: "image/png",
    });
    mockWechatFetch({ upload: { errcode: 0, url: "https://mmbiz.qpic.cn/local" } });
    const out = await replaceContentImages('<img src="/uploads/uuid.png">', "AT");
    expect(out).toBe('<img src="https://mmbiz.qpic.cn/local">');
    expect(mocks.readLocalImage).toHaveBeenCalledWith("uuid.png");
  });

  it("站内图读取失败报中文错误（防微信静默过滤整体失败）", async () => {
    mocks.readStorageObject.mockRejectedValue(
      new Error("站内对象图片读取失败（acs/x.png）：服务端拒绝了签名（HTTP 401/403）"),
    );
    mockWechatFetch();
    await expect(
      replaceContentImages('<img src="/api/storage/object/acs%2Fx.png">', "AT"),
    ).rejects.toThrow(/站内对象图片读取失败/);
  });

  it("未知相对路径直接报错且不发起 fetch", async () => {
    mockWechatFetch();
    await expect(replaceContentImages('<img src="/relative/foo.png">', "AT")).rejects.toThrow(
      /图片地址无法读取/,
    );
  });
});

describe("草稿编排", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokenCache();
    vi.clearAllMocks();
  });

  it("resolveCoverUrl：优先特色图片，其次正文第一张图，再降级账号默认封面，全无报错", () => {
    expect(resolveCoverUrl('<img src="https://x/1.jpg">', "https://x/cover.jpg")).toBe(
      "https://x/cover.jpg",
    );
    expect(resolveCoverUrl('<p>前</p><img src="https://x/first.jpg">')).toBe("https://x/first.jpg");
    // 无特色图片、无正文图 → 账号默认封面
    expect(resolveCoverUrl("<p>纯文字</p>", null, "https://x/default.jpg")).toBe(
      "https://x/default.jpg",
    );
    // 特色图片优先级高于默认封面
    expect(resolveCoverUrl("<p>纯文字</p>", "https://x/cover.jpg", "https://x/default.jpg")).toBe(
      "https://x/cover.jpg",
    );
    expect(() => resolveCoverUrl("<p>没图</p>", null, null)).toThrow(/默认封面/);
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
    const addCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("draft/add"),
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

  it("文章无图且未配默认封面时报错且不调 draft/add", async () => {
    mocks.weChatConfigFindUnique.mockResolvedValue(config);
    mocks.articleFindUnique.mockResolvedValue({ id: "a1", title: "T", featuredImage: null });
    mockFetchSequence([TOKEN]);
    await expect(sendArticleToWechatDraft("wc1", "a1", "<p>纯文字</p>")).rejects.toThrow(
      /默认封面/,
    );
  });

  it("封面为站内对象相对路径（/api/storage/object/）时 SDK 直读上传，不再报 Failed to parse URL", async () => {
    mocks.weChatConfigFindUnique.mockResolvedValue(config);
    mocks.articleFindUnique.mockResolvedValue({
      id: "a1",
      title: "T标题",
      featuredImage: "/api/storage/object/acs%2Fcover.png",
    });
    mocks.weChatPublishUpsert.mockResolvedValue({});
    mocks.readStorageObject.mockResolvedValue({
      bytes: new Uint8Array(1024),
      contentType: "image/png",
    });
    mockWechatFetch({
      material: { errcode: 0, media_id: "THUMB" },
      draft: { errcode: 0, media_id: "DRAFT_MID" },
    });
    expect(await sendArticleToWechatDraft("wc1", "a1", "<p>纯文字正文</p>")).toEqual({
      mediaId: "DRAFT_MID",
    });
    expect(mocks.readStorageObject).toHaveBeenCalledWith("acs/cover.png");
    for (const call of (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).toContain("api.weixin.qq.com");
    }
  });

  it("无图文章用默认封面：首次上传并回写 media_id 缓存，再次发送复用不再上传", async () => {
    const withCover = {
      ...config,
      defaultCoverUrl: "https://cdn.example.com/default.jpg",
      defaultCoverMediaId: null,
    };
    mocks.articleFindUnique.mockResolvedValue({ id: "a1", title: "T", featuredImage: null });
    mocks.weChatPublishUpsert.mockResolvedValue({});
    mocks.weChatConfigUpdate.mockResolvedValue({});
    mockWechatFetch({
      material: { errcode: 0, media_id: "DEF_THUMB" },
      draft: { errcode: 0, media_id: "D1" },
    });

    // 第一次发送：默认封面首次上传 → 回写缓存
    mocks.weChatConfigFindUnique.mockResolvedValue(withCover);
    expect(await sendArticleToWechatDraft("wc1", "a1", "<p>纯文字</p>")).toEqual({
      mediaId: "D1",
    });
    expect(mocks.weChatConfigUpdate).toHaveBeenCalledWith({
      where: { id: "wc1" },
      data: { defaultCoverMediaId: "DEF_THUMB" },
    });

    // 第二次发送：命中缓存，不再调 add_material（fetch 只有 token + draft/add 两次微信调用）
    mocks.weChatConfigFindUnique.mockResolvedValue({
      ...withCover,
      defaultCoverMediaId: "DEF_THUMB",
    });
    vi.mocked(globalThis.fetch).mockClear();
    mocks.weChatPublishUpsert.mockClear();
    expect(await sendArticleToWechatDraft("wc1", "a1", "<p>纯文字</p>")).toEqual({
      mediaId: "D1",
    });
    const wxCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("api.weixin.qq.com"),
    );
    expect(wxCalls.some((c) => String(c[0]).includes("add_material"))).toBe(false);
  });
  // 注：「默认封面 URL 变更后不复用旧 media_id」由 updateWechatDefaultCover 在改 URL 时
  // 直接清空 defaultCoverMediaId 保证（见配置 CRUD 用例），服务层不会出现新旧错配状态。

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

  it("updateWechatDefaultCover：写入 URL 并失效 media_id 缓存", async () => {
    mocks.weChatConfigUpdate.mockResolvedValue({
      id: "wc1",
      defaultCoverUrl: "https://cdn.example.com/new.jpg",
    });
    const result = await updateWechatDefaultCover("wc1", "https://cdn.example.com/new.jpg");
    expect(result?.defaultCoverUrl).toBe("https://cdn.example.com/new.jpg");
    expect(mocks.weChatConfigUpdate).toHaveBeenCalledWith({
      where: { id: "wc1" },
      data: { defaultCoverUrl: "https://cdn.example.com/new.jpg", defaultCoverMediaId: null },
    });
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
