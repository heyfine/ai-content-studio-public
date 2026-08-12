import { checkRobots } from "./robots-check";
import { fetchDocument } from "./fetcher";
import { decodeBuffer } from "./charset";
import { parseHtml } from "./html-parser";
import { contentHash } from "./content-hash";

/**
 * 抓取编排：URL → robots → SSRF/fetch → 解码 → 解析 → contentHash。
 * service 层据此建/更新 Source 与版本。各步失败落 reason，不抛异常打断调用者。
 */

export interface PipelineOptions {
  robotsFetcher?: (url: string) => Promise<{ status: number; ok: boolean; text: string }>;
  resolve?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  now?: number;
}

export interface PipelineSuccess {
  kind: "ok";
  html: string;
  parsed: NonNullable<ReturnType<typeof parseHtml>>;
  /** 进入正文比较的纯文本（normalizedContent 来源） */
  normalizedContent: string;
  /** 内容哈希 */
  hash: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string | undefined;
  robotsStatus: "allowed" | "disallowed" | "unknown" | "unavailable";
}

export interface PipelineBlocked {
  kind: "blocked";
  reason: string;
  /** 标定 fetchStatus 用 */
  fetchStatus: "blocked" | "requires_access" | "failed";
  robotsStatus: "allowed" | "disallowed" | "unknown" | "unavailable";
  httpStatus?: number;
  finalUrl?: string;
}

export type PipelineResult = PipelineSuccess | PipelineBlocked;

export async function runFetchPipeline(
  url: string,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const robots = await checkRobots({ url, fetcher: opts.robotsFetcher, now: opts.now });
  if (robots.status === "disallowed") {
    return {
      kind: "blocked",
      reason: `robots disallowed：${url}`,
      fetchStatus: "blocked",
      robotsStatus: robots.status,
    };
  }
  const fetch = await fetchDocument(url, {
    resolve: opts.resolve,
    timeoutMs: opts.timeoutMs,
    maxBytes: opts.maxBytes,
  });
  if (fetch.blocked) {
    return {
      kind: "blocked",
      reason: fetch.reason ?? "抓取被阻断",
      fetchStatus: "blocked",
      robotsStatus: robots.status,
      httpStatus: fetch.status,
    };
  }
  if (fetch.status === 401 || fetch.status === 403) {
    return {
      kind: "blocked",
      reason: `需登录访问（${fetch.status}）`,
      fetchStatus: "requires_access",
      robotsStatus: robots.status,
      httpStatus: fetch.status,
      finalUrl: fetch.finalUrl,
    };
  }
  if (!fetch.ok) {
    return {
      kind: "blocked",
      reason: `HTTP ${fetch.status}`,
      fetchStatus: "failed",
      robotsStatus: robots.status,
      httpStatus: fetch.status,
    };
  }
  const contentType = fetch.headers.get("content-type") ?? undefined;
  const html = decodeBuffer(fetch.buffer, contentType);
  const parsed = parseHtml(html, fetch.finalUrl);
  if (!parsed) {
    return {
      kind: "blocked",
      reason: "正文解析失败",
      fetchStatus: "failed",
      robotsStatus: robots.status,
      httpStatus: fetch.status,
    };
  }
  const normalizedContent = parsed.textContent || parsed.excerpt || "";
  if (!normalizedContent) {
    return {
      kind: "blocked",
      reason: "无可提取正文",
      fetchStatus: "failed",
      robotsStatus: robots.status,
      httpStatus: fetch.status,
    };
  }
  return {
    kind: "ok",
    html,
    parsed,
    normalizedContent,
    hash: contentHash(normalizedContent),
    finalUrl: fetch.finalUrl,
    httpStatus: fetch.status,
    contentType,
    robotsStatus: robots.status,
  };
}