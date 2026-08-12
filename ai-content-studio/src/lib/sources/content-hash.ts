import { createHash } from "node:crypto";

/** 折叠连续空白为单空格并去首尾，使 contentHash 对等价空白内容保持确定一致 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 计算正文内容的 sha256（归一空白后），作为 Source 去重与版本比对键 */
export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeWhitespace(text), "utf8").digest("hex");
}

export { normalizeWhitespace };