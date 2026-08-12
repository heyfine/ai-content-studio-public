/** 从 Authorization 头提取 Bearer token；不合法返回 null。 */
export function extractBearerKey(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^\s*Bearer\s+(.+?)\s*$/i.exec(header);
  return match ? match[1] : null;
}
