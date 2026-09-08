// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, trashMock, storageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  trashMock: {
    listRemoteTrash: vi.fn(),
    trashRemoteImage: vi.fn(),
    trashRemoteImages: vi.fn(),
    restoreRemoteImage: vi.fn(),
    restoreRemoteImages: vi.fn(),
    purgeRemoteImage: vi.fn(),
    purgeRemoteImages: vi.fn(),
  },
  storageMock: {
    getEnabledStorageConfig: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/image-trash-service", () => trashMock);
vi.mock("@/lib/services/storage-service", () => storageMock);

import { POST as batchDeletePost } from "../batch-delete/route";
import { POST as trashPost } from "./route";

const session = { user: { id: "u1" } };
const storageRow = { id: "s1", keyPrefix: "acs/", endpoint: "https://s3.example.com", bucket: "b" };

function req(body: object, path = "https://x/api/storage/images/trash") {
  return new Request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("云端图片批量 API", () => {
  beforeEach(() => {
    authMock.mockReset();
    for (const fn of Object.values(trashMock)) fn.mockReset();
    storageMock.getEnabledStorageConfig.mockReset();
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
  });

  it("POST /api/storage/images/batch-delete：未登录 401；未启用存储 400；批量进回收站", async () => {
    authMock.mockResolvedValue(null);
    expect(
      (
        await batchDeletePost(
          req({ keys: ["acs/a.png"] }, "https://x/api/storage/images/batch-delete"),
        )
      ).status,
    ).toBe(401);
    authMock.mockResolvedValue(session);
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
    expect(
      (await batchDeletePost(req({}, "https://x/api/storage/images/batch-delete"))).status,
    ).toBe(400);
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    trashMock.trashRemoteImages.mockResolvedValue([{ id: "acs/a.png", ok: true }]);
    const res = await batchDeletePost(
      req({ keys: ["acs/a.png"] }, "https://x/api/storage/images/batch-delete"),
    );
    expect(res.status).toBe(200);
    expect(trashMock.trashRemoteImages).toHaveBeenCalledWith(storageRow, ["acs/a.png"]);
  });

  it("POST /api/storage/images/trash：keys 批量 restore/purge；单条不受影响", async () => {
    authMock.mockResolvedValue(session);
    trashMock.restoreRemoteImages.mockResolvedValue([{ id: "acs/trash/a.png", ok: true }]);
    const batchRestore = await trashPost(req({ op: "restore", keys: ["acs/trash/a.png"] }));
    expect(batchRestore.status).toBe(200);
    expect(trashMock.restoreRemoteImages).toHaveBeenCalledWith(storageRow, ["acs/trash/a.png"]);

    trashMock.purgeRemoteImages.mockResolvedValue([{ id: "acs/trash/a.png", ok: true }]);
    const batchPurge = await trashPost(req({ op: "purge", keys: ["acs/trash/a.png"] }));
    expect(batchPurge.status).toBe(200);

    expect((await trashPost(req({ op: "restore", key: "acs/trash/x.png" }))).status).toBe(200);
    expect(trashMock.restoreRemoteImage).toHaveBeenCalledWith(storageRow, "acs/trash/x.png");
    expect((await trashPost(req({ op: "restore" }))).status).toBe(400);
  });
});
