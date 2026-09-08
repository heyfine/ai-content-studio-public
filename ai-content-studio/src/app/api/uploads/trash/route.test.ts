// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, trashMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
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

import { DELETE } from "../[name]/route";
import { GET as trashGet, POST as trashPost } from "./route";

const session = { user: { email: "a@b.com" } };
const nameParams = { params: Promise.resolve({ name: "abc.png" }) };

describe("图片回收站 API", () => {
  beforeEach(() => {
    authMock.mockReset();
    for (const fn of Object.values(trashMock)) fn.mockReset();
  });

  it("DELETE /api/uploads/[name]：未登录 401；不存在 404；成功进回收站", async () => {
    authMock.mockResolvedValue(null);
    expect((await DELETE(new Request("https://x"), nameParams)).status).toBe(401);
    authMock.mockResolvedValue(session);
    trashMock.trashLocalImage.mockResolvedValueOnce(false);
    expect((await DELETE(new Request("https://x"), nameParams)).status).toBe(404);
    trashMock.trashLocalImage.mockResolvedValueOnce(true);
    expect((await DELETE(new Request("https://x"), nameParams)).status).toBe(200);
    expect(trashMock.trashLocalImage).toHaveBeenCalledWith("abc.png");
  });

  it("GET /api/uploads/trash：未登录 401；登录返回回收站列表", async () => {
    authMock.mockResolvedValue(null);
    expect((await trashGet()).status).toBe(401);
    authMock.mockResolvedValue(session);
    trashMock.listLocalTrash.mockResolvedValue([
      {
        id: "x.png",
        backend: "local",
        url: "/uploads/trash/x.png",
        size: 1,
        deletedAt: "2026-09-07T00:00:00.000Z",
        expiresAt: "2026-09-21T00:00:00.000Z",
        daysLeft: 14,
      },
    ]);
    const res = await trashGet();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }[])[0].id).toBe("x.png");
  });

  it("POST /api/uploads/trash：restore / purge / purge-expired / 缺参 / 未知 op", async () => {
    authMock.mockResolvedValue(session);
    const req = (body: object) =>
      new Request("https://x/api/uploads/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    trashMock.restoreLocalImage.mockResolvedValueOnce(true);
    expect((await trashPost(req({ op: "restore", name: "x.png" }))).status).toBe(200);
    trashMock.restoreLocalImage.mockResolvedValueOnce(false);
    expect((await trashPost(req({ op: "restore", name: "x.png" }))).status).toBe(404);
    trashMock.purgeLocalImage.mockResolvedValueOnce(true);
    expect((await trashPost(req({ op: "purge", name: "x.png" }))).status).toBe(200);
    trashMock.purgeExpiredImages.mockResolvedValueOnce({
      local: 2,
      remote: 1,
      remoteSkipped: false,
    });
    const exp = await trashPost(req({ op: "purge-expired" }));
    expect(exp.status).toBe(200);
    expect((await exp.json()) as { local: number }).toMatchObject({ local: 2 });
    expect((await trashPost(req({ op: "restore" }))).status).toBe(400);
    expect((await trashPost(req({ op: "wat", name: "x.png" }))).status).toBe(400);
  });

  it("POST /api/uploads/trash：未登录 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await trashPost(
      new Request("https://x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "restore", name: "x.png" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
