/**
 * 微信公众号服务层：个人未认证订阅号「API 建草稿 → 后台手动发表」通道。
 *
 * 调用链（全部服务端发起，AppSecret 不出后端）：
 *   stable_token（缓存）→ material/add_material（封面 → thumb_media_id，必填）
 *   → media/uploadimg（正文图转存微信图床，外链图会被微信静默过滤，必须先行替换）
 *   → draft/add（正文 HTML ≤2 万字符）→ WeChatPublish 记录。
 *
 * 权限现状（2025-07 起）：个人未认证号可用 token/素材/草稿接口；
 * freepublish 发布接口仅认证账号可用，本服务只做到草稿箱。
 */
import type { WeChatConfig } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { WechatConfigValues } from "@/lib/schemas/wechat";

const WX_API_BASE = "https://api.weixin.qq.com/cgi-bin";
const TOKEN_TTL_MS = 7200 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const CONTENT_IMAGE_MAX_BYTES = 1024 * 1024; // uploadimg 硬限 1MB
const COVER_MAX_BYTES = 10 * 1024 * 1024; // add_material 限 10MB

/** 微信接口业务错误（HTTP 200 但 errcode != 0），message 为面向用户的中文提示 */
export class WechatApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "WechatApiError";
  }
}

/** 微信 errcode → 可操作的中文提示（IP 白名单 40164 卡在取 token 一步，最常见） */
function wxErrorMessage(code: number, errmsg: string): string {
  if (code === 40164) {
    const ip = errmsg.match(/invalid\s*ip\s*([\d.]+)/i)?.[1];
    return `本机出口 IP ${ip ?? "（见微信返回）"} 不在公众号 IP 白名单内，请到「公众号后台 → 设置与开发 → 基本配置 → IP 白名单」添加后重试`;
  }
  if (code === 48001)
    return "该公众号无此接口权限（个人未认证号仅开放素材/草稿接口，发布接口不可用）";
  if (code === 40001) return "access_token 无效或已过期，请重试（如持续出现请检查 AppSecret）";
  if (code === 40007) return "无效的 media_id，封面素材可能上传失败，请重试";
  if (code === 45009) return "超出接口每日调用限额，请明天再试";
  return `微信接口错误（errcode=${code}）：${errmsg}`;
}

interface WxJson {
  errcode?: number;
  errmsg?: string;
}

function assertWxOk(data: WxJson): void {
  if (typeof data.errcode === "number" && data.errcode !== 0) {
    throw new WechatApiError(data.errcode, wxErrorMessage(data.errcode, data.errmsg ?? "未知错误"));
  }
}

// ---------- access_token（stable_token + 进程内缓存） ----------

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** 测试用：清空 token 缓存（不传则全清） */
export function clearTokenCache(configId?: string): void {
  if (configId) tokenCache.delete(configId);
  else tokenCache.clear();
}

export async function getAccessToken(
  config: Pick<WeChatConfig, "id" | "appId" | "appSecret">,
): Promise<string> {
  const cached = tokenCache.get(config.id);
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const res = await fetch(`${WX_API_BASE}/stable_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: config.appId,
      secret: decrypt(config.appSecret),
      force_refresh: false,
    }),
  });
  const data = (await res.json()) as WxJson & { access_token?: string; expires_in?: number };
  assertWxOk(data);
  if (!data.access_token) throw new WechatApiError(-1, "微信未返回 access_token");
  const ttl = (data.expires_in ?? 7200) * 1000;
  tokenCache.set(config.id, {
    token: data.access_token,
    expiresAt: Date.now() + ttl - TOKEN_REFRESH_MARGIN_MS,
  });
  return data.access_token;
}

// ---------- 图片上传（正文图 uploadimg / 封面 add_material 不可互换） ----------

async function fetchImageBlob(imageUrl: string): Promise<{ blob: Blob; size: number }> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`图片下载失败：${imageUrl}（HTTP ${res.status}）`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(jpeg|png)$/.test(contentType)) {
    throw new Error(
      `正文/封面图仅支持 jpg/png（${imageUrl} 实为 ${contentType || "未知类型"}），请先转换格式`,
    );
  }
  const buf = await res.arrayBuffer();
  return { blob: new Blob([buf], { type: contentType }), size: buf.byteLength };
}

/** 正文图转存微信图床，返回 mmbiz.qpic.cn URL（不占素材配额，仅 jpg/png <1MB） */
export async function uploadContentImage(accessToken: string, imageUrl: string): Promise<string> {
  const { blob, size } = await fetchImageBlob(imageUrl);
  if (size >= CONTENT_IMAGE_MAX_BYTES) {
    throw new Error(
      `正文图需小于 1MB（${imageUrl} 为 ${(size / 1024 / 1024).toFixed(2)}MB），请压缩后重试`,
    );
  }
  const form = new FormData();
  form.append("media", blob, "image");
  const res = await fetch(`${WX_API_BASE}/media/uploadimg?access_token=${accessToken}`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as WxJson & { url?: string };
  assertWxOk(data);
  if (!data.url) throw new WechatApiError(-1, `微信未返回图片 URL：${imageUrl}`);
  return data.url;
}

/** 封面上传为永久图片素材，返回 media_id（供 thumb_media_id，≤10MB） */
export async function uploadCoverMaterial(accessToken: string, imageUrl: string): Promise<string> {
  const { blob, size } = await fetchImageBlob(imageUrl);
  if (size >= COVER_MAX_BYTES) {
    throw new Error(`封面图需小于 10MB（${imageUrl} 为 ${(size / 1024 / 1024).toFixed(2)}MB）`);
  }
  const form = new FormData();
  form.append("media", blob, "cover.jpg");
  const res = await fetch(
    `${WX_API_BASE}/material/add_material?access_token=${accessToken}&type=image`,
    { method: "POST", body: form },
  );
  const data = (await res.json()) as WxJson & { media_id?: string };
  assertWxOk(data);
  if (!data.media_id) throw new WechatApiError(-1, `微信未返回封面 media_id：${imageUrl}`);
  return data.media_id;
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc="([^"]+)"/gi;

/** 封面取值：优先文章特色图片，否则正文第一张图（在正文图转存前调用，拿原始可下载 URL） */
export function resolveCoverUrl(html: string, featuredImage?: string | null): string {
  const cover = (featuredImage ?? "").trim() || IMG_SRC_RE.exec(html)?.[1] || "";
  IMG_SRC_RE.lastIndex = 0;
  if (!cover) {
    throw new Error("公众号草稿必须有封面图：请先在文章中插入至少一张图片，或为文章设置特色图片");
  }
  return cover;
}

/**
 * 把正文中全部外链图片转存为微信图床 URL 并回填。
 * 微信对非图床图会「静默过滤」（draft/add 仍返回 0），因此任何一张转存失败都整体报错。
 * 相同 URL 只上传一次；data:/blob: 内嵌图无法转存，直接报错。
 */
export async function replaceContentImages(html: string, accessToken: string): Promise<string> {
  const sources = [...new Set([...html.matchAll(IMG_SRC_RE)].map((m) => m[1]))];
  IMG_SRC_RE.lastIndex = 0;
  if (sources.length === 0) return html;
  const urlMap = new Map<string, string>();
  for (const src of sources) {
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      throw new Error(
        `正文包含内嵌图片（data:/blob: URI），无法转存到微信图床，请改用普通图片 URL`,
      );
    }
    urlMap.set(src, await uploadContentImage(accessToken, src));
  }
  let out = html;
  for (const [src, wxUrl] of urlMap) out = out.split(src).join(wxUrl);
  return out;
}

// ---------- 草稿 ----------

export interface WechatDraftInput {
  title: string;
  content: string;
  thumbMediaId: string;
  digest?: string;
  author?: string;
  /** 「阅读原文」链接 */
  contentSourceUrl?: string;
}

/** 去标签取纯文本（服务端无 DOM，正则足够：digest 与正文长度提示用） */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 调 draft/add 新建草稿，返回草稿 media_id */
export async function createWechatDraft(
  accessToken: string,
  input: WechatDraftInput,
): Promise<string> {
  const res = await fetch(`${WX_API_BASE}/draft/add?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      articles: [
        {
          article_type: "news",
          title: input.title,
          author: input.author,
          digest: input.digest,
          content: input.content,
          thumb_media_id: input.thumbMediaId,
          need_open_comment: 1,
          only_fans_can_comment: 0,
          content_source_url: input.contentSourceUrl,
        },
      ],
    }),
  });
  const data = (await res.json()) as WxJson & { media_id?: string };
  assertWxOk(data);
  if (!data.media_id) throw new WechatApiError(-1, "微信未返回草稿 media_id");
  return data.media_id;
}

// ---------- 配置 CRUD ----------

export async function listWechatConfigs() {
  return prisma.weChatConfig.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createWechatConfig(input: WechatConfigValues) {
  return prisma.weChatConfig.create({
    data: { name: input.name, appId: input.appId, appSecret: encrypt(input.appSecret) },
  });
}

export async function deleteWechatConfig(id: string): Promise<void> {
  try {
    await prisma.weChatConfig.delete({ where: { id } });
  } catch {
    throw new Error("公众号配置不存在或已删除");
  }
}

// ---------- 编排：文章 → 公众号草稿箱 ----------

/**
 * 把文章送进公众号草稿箱：
 * token → 封面素材（featuredImage / 正文第一张图）→ 正文图转存 → draft/add → 记录落库。
 * 同一文章重复发送同一公众号时覆盖旧草稿记录（草稿箱内微信按 media_id 各自成稿）。
 */
export async function sendArticleToWechatDraft(
  configId: string,
  articleId: string,
  wechatHtml: string,
): Promise<{ mediaId: string }> {
  const config = await prisma.weChatConfig.findUnique({ where: { id: configId } });
  if (!config || !config.enabled) throw new Error("公众号配置不存在或未启用");
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) throw new Error("文章不存在");

  const accessToken = await getAccessToken(config);
  const thumbMediaId = await uploadCoverMaterial(
    accessToken,
    resolveCoverUrl(wechatHtml, article.featuredImage),
  );
  const content = await replaceContentImages(wechatHtml, accessToken);
  const mediaId = await createWechatDraft(accessToken, {
    title: article.title,
    content,
    digest: stripHtml(content).slice(0, 120) || undefined,
    thumbMediaId,
  });
  await prisma.weChatPublish.upsert({
    where: { articleId_configId: { articleId, configId } },
    create: { articleId, configId, mediaId },
    update: { mediaId, publishedAt: new Date() },
  });
  return { mediaId };
}
