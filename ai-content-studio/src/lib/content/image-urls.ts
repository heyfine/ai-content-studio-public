/**
 * 从文章 markdown 中提取图片 URL（markdown 语法 + HTML img 标签），
 * 跳过 data:/blob: 内嵌图（无法作为公网链接展示）。
 */
export function extractImageUrls(markdown: string): string[] {
  const out = new Set<string>();
  const mdRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  for (const m of markdown.matchAll(mdRe)) {
    const url = m[1].trim();
    if (url) out.add(url);
  }
  const imgRe = /<img\b[^>]*?\bsrc="([^"]+)"/gi;
  for (const m of markdown.matchAll(imgRe)) {
    const url = m[1].trim();
    if (url) out.add(url);
  }
  return [...out].filter((u) => !u.startsWith("data:") && !u.startsWith("blob:"));
}

/** 本地图片库文件名白名单（randomUUID + 扩展名，防目录穿越） */
export const LOCAL_IMAGE_NAME_RE = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

/** URL 是否指向本地图片库 */
export function isLocalImageUrl(url: string): boolean {
  return url.startsWith("/uploads/");
}
