/** 统一 JSON 请求：非 2xx 时抛出后端返回的 error 文本 */
export async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `请求失败 (${res.status})`);
  }
  return (await res.json()) as T;
}
