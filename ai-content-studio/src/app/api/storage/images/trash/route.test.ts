// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, trashMock, storageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  trashMock: {
    listRemoteTrash: vi.fn(),
    trashRemoteImage: vi.fn(),
    restoreRemoteImage: vi.fn(),
    purgeRemoteImage: vi.fn(),
  },
  storageMock: {
    getEnabledStorageConfig: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/image-trash-service", () => trashMock);
vi.mock("@/lib/services/storage-service", () => storageMock);

import { DELETE as imageDelete } from "../[key]/route";
import { GET as trashGet, POST as trashPost } from "./route";

const session = { user: { id: "u1" } };
const storageRow = {
  id: "s1",
  keyPrefix: "acs/",
  endpoint: "https://s3.example.com",
  bucket: "b",
};

function req(body: object) {
  return new Request("https://x/api/storage/images/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("云端图片回收站 API", () => {
  beforeEach(() => {
    authMock.mockReset();
    for (const fn of Object.values(trashMock)) fn.mockReset();
    storageMock.getEnabledStorageConfig.mockReset();
  });

  it("GET：未登录 401；未启用对象存储 enabled=false；登录返回列表", async () => {
    authMock.mockResolvedValue(null);
    expect((await trashGet()).status).toBe(401);
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
    const empty = (await (await trashGet()).json()) as { enabled: boolean };
    expect(empty.enabled).toBe(false);
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    trashMock.listRemoteTrash.mockResolvedValue([
      {
        id: "acs/trash/x.png",
        backend: "remote",
        url: "https://cdn/x.png",
        size: 1,
        deletedAt: "2026-09-07T00:00:00.000Z",
        expiresAt: "2026-09-21T00:00:00.000Z",
        daysLeft: 14,
      },
    ]);
    const res = await trashGet();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { images: { id: string }[] }).images[0].id).toBe(
      "acs/trash/x.png",
    );
  });

  it("POST restore/purge：透传到服务层；缺 key 与未知 op 400", async () => {
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    expect((await trashPost(req({ op: "restore", key: "acs/trash/x.png" }))).status).toBe(200);
    expect(trashMock.restoreRemoteImage).toHaveBeenCalledWith(storageRow, "acs/trash/x.png");
    expect((await trashPost(req({ op: "purge", key: "acs/trash/x.png" }))).status).toBe(200);
    expect(trashMock.purgeRemoteImage).toHaveBeenCalledWith(storageRow, "acs/trash/x.png");
    expect((await trashPost(req({ op: "restore" }))).status).toBe(400);
    expect((await trashPost(req({ op: "wat", key: "acs/trash/x.png" }))).status).toBe(400);
  });

  it("POST：越界 key（服务层抛「仅允许」）映射 403；未登录 401；未启用存储 400", async () => {
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    trashMock.restoreRemoteImage.mockRejectedValue(
      new Error("仅允许恢复回收站内的对象：acs/x.png"),
    );
    const res = await trashPost(req({ op: "restore", key: "acs/x.png" }));
    expect(res.status).toBe(403);
    authMock.mockResolvedValue(null);
    expect((await trashPost(req({ op: "restore", key: "k" }))).status).toBe(401);
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
    expect((await trashPost(req({ op: "restore", key: "k" }))).status).toBe(400);
  });

  it("DELETE /api/storage/images/[key]：进回收站；已在回收站中 409", async () => {
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    const del = (key: string) =>
      imageDelete(new Request("https://x"), { params: Promise.resolve({ key }) });
    expect((await del("acs%2Fx.png")).status).toBe(200);
    expect(trashMock.trashRemoteImage).toHaveBeenCalledWith(storageRow, "acs/x.png");
    trashMock.trashRemoteImage.mockRejectedValue(new Error("对象已在回收站中"));
    expect((await del("acs%2Ftrash%2Fx.png")).status).toBe(409);
  });
});
