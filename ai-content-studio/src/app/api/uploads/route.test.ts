// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, listMock, delMock, importMock, trashMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listMock: vi.fn(),
  delMock: vi.fn(),
  importMock: vi.fn(),
  trashMock: {
    listLocalTrash: vi.fn(),
    trashLocalImage: vi.fn(),
    restoreLocalImage: vi.fn(),
    purgeLocalImage: vi.fn(),
    purgeExpiredImages: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/image-trash-service", () => trashMock);
vi.mock("@/lib/services/image-upload-service", () => ({
  listLocalImages: listMock,
  deleteLocalImage: delMock,
  importImageFromUrl: importMock,
}));

import { DELETE } from "./[name]/route";
import { POST as importPost } from "./import/route";
import { GET } from "./route";

describe("图片库 API", () => {
  beforeEach(() => {
    authMock.mockReset();
    listMock.mockReset();
    delMock.mockReset();
    importMock.mockReset();
  });

  it("GET /api/uploads：未登录 401，登录后返回本地图片列表", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    listMock.mockResolvedValue([{ name: "x.png", url: "/uploads/x.png", size: 1, mtime: "" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].url).toBe("/uploads/x.png");
  });

  it("DELETE /api/uploads/[name]：未登录 401；不存在 404；成功进回收站", async () => {
    const params = { params: Promise.resolve({ name: "abc.png" }) };
    authMock.mockResolvedValue(null);
    expect((await DELETE(new Request("https://x"), params)).status).toBe(401);
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    trashMock.trashLocalImage.mockResolvedValueOnce(false);
    expect((await DELETE(new Request("https://x"), params)).status).toBe(404);
    trashMock.trashLocalImage.mockResolvedValueOnce(true);
    expect((await DELETE(new Request("https://x"), params)).status).toBe(200);
  });

  it("POST /api/uploads/import：校验 URL 并转存", async () => {
    authMock.mockResolvedValue(null);
    const unauth = await importPost(
      new Request("https://x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://cdn.example.com/a.png" }),
      }),
    );
    expect(unauth.status).toBe(401);

    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const bad = await importPost(
      new Request("https://x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "file:///etc/passwd" }),
      }),
    );
    expect(bad.status).toBe(400);

    importMock.mockResolvedValue("/uploads/abc.png");
    const ok = await importPost(
      new Request("https://x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://cdn.example.com/a.png" }),
      }),
    );
    expect(ok.status).toBe(201);
    expect(importMock).toHaveBeenCalledWith("https://cdn.example.com/a.png");
  });
});
