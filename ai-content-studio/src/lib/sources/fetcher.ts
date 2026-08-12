import { checkSsrf } from "./ssrf-check";

/**
 * 抓取器：逐跳 SSRF 校验 + 手动跟随重定向（上界 5 跳）+ 超时 AbortController + 流式体积上限。
 * SSRF 拒绝/体积超额/重定向超额 → blocked 状态（不抛异常）；失败落 status 0 + reason。
 */

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolve?: (hostname: string) => Promise<string[]>;
}

export interface FetchResult {
  status: number;
  ok: boolean;
  headers: Headers;
  buffer: ArrayBuffer;
  finalUrl: string;
  blocked?: boolean;
  reason?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

function concatBuffers(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

export async function fetchDocument(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const ssrf = await checkSsrf({ url: currentUrl, resolve: opts.resolve });
    if (!ssrf.safe) {
      return {
        status: 0,
        ok: false,
        headers: new Headers(),
        buffer: new ArrayBuffer(0),
        finalUrl: currentUrl,
        blocked: true,
        reason: ssrf.reason,
      };
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(currentUrl, { redirect: "manual", signal: ac.signal });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        clearTimeout(timer);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        clearTimeout(timer);
        return {
          status: res.status,
          ok: res.ok,
          headers: res.headers,
          buffer: new ArrayBuffer(0),
          finalUrl: currentUrl,
        };
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      let oversized = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        size += value.byteLength;
        if (size > maxBytes) {
          oversized = true;
          break;
        }
        chunks.push(value);
      }
      clearTimeout(timer);
      const buffer = concatBuffers(chunks);
      if (oversized) {
        return {
          status: res.status,
          ok: false,
          headers: res.headers,
          buffer,
          finalUrl: currentUrl,
          blocked: true,
          reason: `响应体超过 ${maxBytes} 字节`,
        };
      }
      return { status: res.status, ok: res.ok, headers: res.headers, buffer, finalUrl: currentUrl };
    } catch {
      clearTimeout(timer);
      const aborted = ac.signal.aborted;
      return {
        status: 0,
        ok: false,
        headers: new Headers(),
        buffer: new ArrayBuffer(0),
        finalUrl: currentUrl,
        blocked: false,
        reason: aborted ? `请求超时（${timeoutMs}ms）` : "请求异常",
      };
    }
  }
  return {
    status: 0,
    ok: false,
    headers: new Headers(),
    buffer: new ArrayBuffer(0),
    finalUrl: currentUrl,
    blocked: true,
    reason: `重定向超过 ${maxRedirects} 跳`,
  };
}
