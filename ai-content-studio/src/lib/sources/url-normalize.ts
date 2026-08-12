/**
 * URL 规范化：去 tracking 参数（utm_* / fbclid / gclid 等）、fragment、冗余尾斜杠；
 * 小写 host；排序 query 使规范化结果确定（contentHash 可比）。保留影响内容的参数。
 * 非 http/https 抛错（scheme 限制由 ssrf-check 主导，这里快速失败）。
 */

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "_ga",
  "igshid",
  "yclid",
  "msclkid",
]);

function isUtm(key: string): boolean {
  return key.startsWith("utm_");
}

function isTracking(key: string): boolean {
  return isUtm(key) || TRACKING_PARAMS.has(key.toLowerCase());
}

export function normalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error(`非法 URL：${input}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`仅支持 http/https 协议：${u.protocol}`);
  }
  u.hash = "";
  const toRemove: string[] = [];
  u.searchParams.forEach((_value, key) => {
    if (isTracking(key)) toRemove.push(key);
  });
  for (const key of toRemove) u.searchParams.delete(key);
  u.host = u.host.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  u.searchParams.sort();
  return u.toString();
}

/** 提取域名（小写、含端口），供去重/UI 分组用 */
export function extractDomain(url: string): string {
  return new URL(url).host.toLowerCase();
}