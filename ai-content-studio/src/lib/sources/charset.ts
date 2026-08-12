/**
 * 字符集探测与解码：Content-Type charset 优先，回退 <meta charset / http-equiv>，再回退 UTF-8。
 * 支持 GBK/GB18030 等多字节编码（Node 内置 ICU）。
 */

const DEFAULT_CHARSET = "utf-8";

function normalizeCharset(cs: string): string {
  return cs.trim().toLowerCase();
}

/** 从 Content-Type 头取 charset */
function charsetFromContentType(contentType?: string): string | undefined {
  if (!contentType) return undefined;
  const m = /charset=([a-zA-Z0-9_-]+)/i.exec(contentType);
  return m ? normalizeCharset(m[1]) : undefined;
}

/** 从 HTML 前 1KB 扫 <meta charset> 与 <meta http-equiv content-type> 声明 */
function charsetFromMeta(buffer?: ArrayBuffer): string | undefined {
  if (!buffer || buffer.byteLength === 0) return undefined;
  const len = Math.min(buffer.byteLength, 1024);
  const head = new TextDecoder("latin1").decode(new Uint8Array(buffer, 0, len));
  const m1 = /<meta\s+charset=["']?\s*([a-zA-Z0-9_-]+)/i.exec(head);
  if (m1) return normalizeCharset(m1[1]);
  const m2 = /<meta[^>]*http-equiv=["']?\s*content-type["']?[^>]*content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i.exec(head);
  if (m2) return normalizeCharset(m2[1]);
  return undefined;
}

export function detectCharset(contentType?: string, buffer?: ArrayBuffer): string {
  return charsetFromContentType(contentType) ?? charsetFromMeta(buffer) ?? DEFAULT_CHARSET;
}

/** 用探测到的 charset 解码整个 buffer；不支持的 charset 回退 UTF-8，避免整体失败 */
export function decodeBuffer(buffer: ArrayBuffer, contentType?: string): string {
  const cs = detectCharset(contentType, buffer);
  try {
    return new TextDecoder(cs).decode(new Uint8Array(buffer));
  } catch {
    return new TextDecoder(DEFAULT_CHARSET).decode(new Uint8Array(buffer));
  }
}