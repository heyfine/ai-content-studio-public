/** 图片库共享的展示格式化函数 */

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/** ISO 串 → 「YYYY-MM-DD HH:mm」 */
export function formatTime(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}
