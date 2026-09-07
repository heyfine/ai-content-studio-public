// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getWebdav, listWebdav, putWebdav, testWebdav } from "./webdav";

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init),
  ) as unknown as typeof fetch;
}

const AUTH_OK = (url: string, init?: RequestInit) => {
  const auth = init?.headers && (init.headers as Record<string, string>).Authorization;
  return auth === "Basic dXNlcjpwYXNz"; // user:pass 的 base64
};

describe("webdav 客户端（注入 fetch）", () => {
  it("testWebdav：认证通过返回 ok", async () => {
    const fetchImpl = mockFetch((url, init) => {
      if (!AUTH_OK(url, init)) return new Response(null, { status: 401 });
      if (init?.method === "MKCOL") return new Response(null, { status: 405 }); // 已存在
      return new Response('<?xml version="1.0"?><d:multistatus/>', { status: 207 });
    });
    const r = await testWebdav("https://dav.example.com/backup/", "user", "pass", fetchImpl);
    expect(r.ok).toBe(true);
  });

  it("testWebdav：认证失败给出中文提示", async () => {
    const fetchImpl = mockFetch(() => new Response(null, { status: 401 }));
    const r = await testWebdav("https://dav.example.com/", "user", "wrong", fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("认证失败");
  });

  it("putWebdav：自动逐层 MKCOL 建目录后 PUT", async () => {
    const mkcols: string[] = [];
    const fetchImpl = mockFetch((url, init) => {
      if (!AUTH_OK(url, init)) return new Response(null, { status: 401 });
      if (init?.method === "MKCOL") {
        mkcols.push(url);
        return new Response(null, { status: 201 });
      }
      if (init?.method === "PUT") return new Response(null, { status: 201 });
      return new Response(null, { status: 500 });
    });
    await putWebdav("https://dav.example.com/a/b", "user", "pass", "acs-backup-x.json", "{}", fetchImpl);
    expect(mkcols).toEqual(["https://dav.example.com/a/", "https://dav.example.com/a/b/"]);
  });

  it("listWebdav：解析 PROPFIND 中的 .json 条目", async () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/backup/acs-backup-1.json</d:href><d:propstat><d:prop>
        <d:getcontentlength>123</d:getcontentlength>
        <d:getlastmodified>Fri, 05 Sep 2026 03:26:41 GMT</d:getlastmodified>
      </d:prop></d:propstat></d:response>
      <d:response><d:href>/backup/readme.txt</d:href></d:response>
    </d:multistatus>`;
    const fetchImpl = mockFetch((url, init) => {
      if (!AUTH_OK(url, init)) return new Response(null, { status: 401 });
      if (init?.method === "MKCOL") return new Response(null, { status: 405 }); // 已存在
      return new Response(xml, { status: 207 });
    });
    const files = await listWebdav("https://dav.example.com/backup", "user", "pass", fetchImpl);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("acs-backup-1.json");
    expect(files[0].size).toBe(123);
  });

  it("getWebdav：下载返回文本内容", async () => {
    const fetchImpl = mockFetch((url, init) => {
      if (!AUTH_OK(url, init)) return new Response(null, { status: 401 });
      return new Response('{"format":"acs-backup"}', { status: 200 });
    });
    const text = await getWebdav("https://dav.example.com/b", "user", "pass", "a.json", fetchImpl);
    expect(text).toContain("acs-backup");
  });
});
