// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, trashMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  trashMock: {
    listLocalTrash: vi.fn(),
    trashLocalImage: vi.fn(),
    trashLocalImages: vi.fn(),
    restoreLocalImage: vi.fn(),
    restoreLocalImages: vi.fn(),
    purgeLocalImage: vi.fn(),
    purgeLocalImages: vi.fn(),
    purgeExpiredImages: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/image-trash-service", () => trashMock);

import { POST as batchDeletePost } from "../batch-delete/route";
import { GET as trashGet, POST as trashPost } from "./route";

const session = { user: { email: "a@b.com" } };

function req(body: object, path = "https://x/api/uploads/trash") {
  return new Request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("本地图片批量删除 API", () => {
  beforeEach(() => {
    authMock.mockReset();
    for (const fn of Object.values(trashMock)) fn.mockReset();
  });

  it("POST /api/uploads/batch-delete：未登录 401；缺参 400；批量进回收站", async () => {
    authMock.mockResolvedValue(null);
    expect(
      (await batchDeletePost(req({ names: ["a.png"] }, "https://x/api/uploads/batch-delete")))
        .status,
    ).toBe(401);
    authMock.mockResolvedValue(session);
    expect((await batchDeletePost(req({}, "https://x/api/uploads/batch-delete"))).status).toBe(400);
    expect(
      (await batchDeletePost(req({ names: [1] }, "https://x/api/uploads/batch-delete"))).status,
    ).toBe(400);
    trashMock.trashLocalImages.mockResolvedValue([
      { id: "a.png", ok: true },
      { id: "b.png", ok: false, error: "不存在" },
    ]);
    const res = await batchDeletePost(
      req({ names: ["a.png", "b.png"] }, "https://x/api/uploads/batch-delete"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ id: string; ok: boolean }> };
    expect(body.results[1].ok).toBe(false);
    expect(trashMock.trashLocalImages).toHaveBeenCalledWith(["a.png", "b.png"]);
  });

  it("POST /api/uploads/trash：names 批量 restore/purge；单条路径不受影响", async () => {
    authMock.mockResolvedValue(session);
    trashMock.restoreLocalImages.mockResolvedValue([{ id: "a.png", ok: true }]);
    const batchRestore = await trashPost(req({ op: "restore", names: ["a.png", "b.png"] }));
    expect(batchRestore.status).toBe(200);
    expect(trashMock.restoreLocalImages).toHaveBeenCalledWith(["a.png", "b.png"]);

    trashMock.purgeLocalImages.mockResolvedValue([{ id: "a.png", ok: true }]);
    const batchPurge = await trashPost(req({ op: "purge", names: ["a.png"] }));
    expect(batchPurge.status).toBe(200);
    expect(trashMock.purgeLocalImages).toHaveBeenCalledWith(["a.png"]);

    trashMock.restoreLocalImage.mockResolvedValue(true);
    expect((await trashPost(req({ op: "restore", name: "x.png" }))).status).toBe(200);
    expect(trashMock.restoreLocalImage).toHaveBeenCalledWith("x.png");

    // 缺 name 且缺 names → 400
    expect((await trashPost(req({ op: "restore" }))).status).toBe(400);
  });

  it("GET 列表仍可用", async () => {
    authMock.mockResolvedValue(session);
    trashMock.listLocalTrash.mockResolvedValue([]);
    expect((await trashGet()).status).toBe(200);
  });
});
