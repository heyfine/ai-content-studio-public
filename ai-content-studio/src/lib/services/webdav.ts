/**
 * WebDAV 客户端（自动备份目标存储）。
 * 用 fetch 直接走 WebDAV 协议：PUT 上传 / PROPFIND 测试与列举 / MKCOL 自动建目录 / DELETE 清理 / GET 下载。
 * 通过 `fetchImpl` 注入便于单测（默认用全局 fetch）。移植自 sales record 的 webdav.ts。
 */
export type WebdavFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class WebdavError extends Error {}

/** UTF-8 安全 Basic 认证头（btoa 需要 latin1 字符串，先转字节串） */
function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}

/** 目录地址补尾斜杠 + 文件名拼接（文件名做 URL 编码） */
function joinUrl(base: string, filename = ""): string {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${encodeURIComponent(filename)}`;
}

function authHeaders(username: string, password: string): Record<string, string> {
  return { Authorization: basicAuth(username, password) };
}

/** 自动创建集合（目录）：对目标 URL 的每一级路径逐层 MKCOL（201/405/409 视为成功） */
async function mkdirp(
  url: string,
  username: string,
  password: string,
  fetchImpl: WebdavFetcher,
): Promise<void> {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  let prefix = "";
  for (const seg of segments) {
    prefix += `/${seg}`;
    const res = await fetchImpl(`${u.origin}${prefix}/`, {
      method: "MKCOL",
      headers: authHeaders(username, password),
    });
    if (res.status === 401 || res.status === 403) {
      throw new WebdavError("认证失败，请检查 WebDAV 用户名/密码");
    }
    if (res.status !== 201 && res.status !== 405 && res.status !== 409) {
      throw new WebdavError(`创建目录失败：HTTP ${res.status}`);
    }
  }
}

export interface WebdavTestResult {
  ok: boolean;
  status?: number;
  message: string | null;
}

/** PROPFIND depth 0：测连通性 + 认证 */
export async function testWebdav(
  url: string,
  username: string,
  password: string,
  fetchImpl: WebdavFetcher = fetch,
): Promise<WebdavTestResult> {
  try {
    await mkdirp(url, username, password, fetchImpl);
    const res = await fetchImpl(joinUrl(url), {
      method: "PROPFIND",
      headers: {
        ...authHeaders(username, password),
        Depth: "0",
        "Content-Type": "application/xml",
      },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
    });
    if (res.status === 207 || (res.status >= 200 && res.status < 300)) {
      return { ok: true, status: res.status, message: null };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: "认证失败，请检查 WebDAV 用户名/密码" };
    }
    return { ok: false, status: res.status, message: `WebDAV 返回 ${res.status}` };
  } catch {
    return { ok: false, message: "无法连接 WebDAV 服务器，请检查地址与网络" };
  }
}

/** PUT 上传一个文件（先 mkdirp 自动建目录） */
export async function putWebdav(
  url: string,
  username: string,
  password: string,
  filename: string,
  body: string,
  fetchImpl: WebdavFetcher = fetch,
): Promise<void> {
  await mkdirp(url, username, password, fetchImpl);
  let res: Response;
  try {
    res = await fetchImpl(joinUrl(url, filename), {
      method: "PUT",
      headers: { ...authHeaders(username, password), "Content-Type": "application/json" },
      body,
    });
  } catch {
    throw new WebdavError("上传失败：无法连接 WebDAV 服务器");
  }
  if (!res.ok) {
    throw new WebdavError(`上传失败：HTTP ${res.status}`);
  }
}

/** DELETE 清理旧文件（尽力而为：失败忽略，避免因清理失败阻塞主备份） */
export async function removeWebdav(
  url: string,
  username: string,
  password: string,
  filename: string,
  fetchImpl: WebdavFetcher = fetch,
): Promise<void> {
  try {
    await fetchImpl(joinUrl(url, filename), {
      method: "DELETE",
      headers: authHeaders(username, password),
    });
  } catch {
    // 忽略清理失败
  }
}

export interface WebdavBackupFile {
  filename: string;
  size: number;
  lastModified: string | null;
}

/** 从 PROPFIND multistatus XML 中解析 .json 文件条目 */
function parsePropfind(xml: string): WebdavBackupFile[] {
  const files: WebdavBackupFile[] = [];
  const responseRe = /<(?:[\w-]+:)?response>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi;
  const hrefRe = /<(?:[\w-]+:)?href>([^<]+)<\//i;
  const lenRe = /<(?:[\w-]+:)?getcontentlength>([^<]+)<\//i;
  const modRe = /<(?:[\w-]+:)?getlastmodified>([^<]+)<\//i;
  let m = responseRe.exec(xml);
  while (m !== null) {
    const block = m[1];
    if (block) {
      const href = block.match(hrefRe)?.[1];
      if (href) {
        const name = decodeURIComponent(href.split("/").filter(Boolean).pop() ?? "");
        if (name.toLowerCase().endsWith(".json")) {
          const size = Number(block.match(lenRe)?.[1] ?? "0");
          const lastModified = block.match(modRe)?.[1] ?? null;
          files.push({ filename: name, size: Number.isFinite(size) ? size : 0, lastModified });
        }
      }
    }
    m = responseRe.exec(xml);
  }
  return files;
}

/** PROPFIND Depth 1 列出目录下的备份文件（.json） */
export async function listWebdav(
  url: string,
  username: string,
  password: string,
  fetchImpl: WebdavFetcher = fetch,
): Promise<WebdavBackupFile[]> {
  await mkdirp(url, username, password, fetchImpl);
  let res: Response;
  try {
    res = await fetchImpl(joinUrl(url), {
      method: "PROPFIND",
      headers: {
        ...authHeaders(username, password),
        Depth: "1",
        "Content-Type": "application/xml",
      },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>',
    });
  } catch {
    throw new WebdavError("无法连接 WebDAV 服务器");
  }
  if (res.status === 401 || res.status === 403) {
    throw new WebdavError("认证失败，请检查 WebDAV 用户名/密码");
  }
  if (res.status !== 207 && !(res.status >= 200 && res.status < 300)) {
    throw new WebdavError(`获取目录列表失败：HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parsePropfind(xml);
}

/** GET 取回一个备份文件内容（字符串） */
export async function getWebdav(
  url: string,
  username: string,
  password: string,
  filename: string,
  fetchImpl: WebdavFetcher = fetch,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(joinUrl(url, filename), {
      method: "GET",
      headers: authHeaders(username, password),
    });
  } catch {
    throw new WebdavError("无法连接 WebDAV 服务器");
  }
  if (res.status === 401 || res.status === 403) {
    throw new WebdavError("认证失败，请检查 WebDAV 用户名/密码");
  }
  if (!res.ok) {
    throw new WebdavError(`下载失败：HTTP ${res.status}`);
  }
  return res.text();
}
