// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getEnabledStorageConfig: vi.fn(),
    putObject: vi.fn(),
    copyRemoteObject: vi.fn(),
    deleteRemoteObject: vi.fn(),
    listObjectsUnderPrefix: vi.fn(),
  },
}));

vi.mock("@/lib/services/storage-service", () => storageMock);

import {
  isExpired,
  listLocalTrash,
  localTrashDir,
  purgeExpiredImages,
  purgeExpiredLocal,
  purgeExpiredRemote,
  purgeLocalImage,
  purgeRemoteImage,
  remoteTrashPrefix,
  restoreLocalImage,
  restoreRemoteImage,
  TRASH_RETENTION_DAYS,
  trashLocalImage,
  trashRemoteImage,
} from "./image-trash-service";
import { listLocalImages, saveImageFile, uploadDir } from "./image-upload-service";
import type { StorageConfigRow } from "./storage-service";

const storageRow = {
  id: "s1",
  name: "缤纷云",
  providerId: "bitiful",
  endpoint: "https://s3.example.com",
  region: "cn-east-1",
  bucket: "acs-media",
  accessKeyId: "AKID",
  secretKey: "enc",
  publicBase: "https://acs-media.example.com",
  keyPrefix: "acs/",
  clientApp: "",
  enabled: true,
} as unknown as StorageConfigRow;

function cleanDir(dir: string) {
  try {
    for (const f of readdirSync(dir)) {
      const full = path.join(dir, f);
      if (existsSync(full)) rmSync(full, { force: true, recursive: true });
    }
  } catch {
    // 目录不存在则忽略
  }
}

function cleanAll() {
  cleanDir(localTrashDir());
  cleanDir(uploadDir());
  try {
    const t = localTrashDir();
    if (existsSync(t)) rmSync(t, { force: true, recursive: true });
  } catch {
    // 忽略
  }
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe("image-trash-service 本地", () => {
  beforeEach(() => {
    cleanAll();
    storageMock.getEnabledStorageConfig.mockReset();
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
  });
  afterEach(() => cleanAll());

  it("trashLocalImage：移入 trash/ 并刷新删除时间，主列表不再包含", async () => {
    const url = await saveImageFile("image/png", new Uint8Array([1]));
    const name = url.slice("/uploads/".length);
    expect(await trashLocalImage(name)).toBe(true);
    // 共享 uploads 目录可能有并行用例的文件：按文件名相对断言
    expect((await listLocalImages()).map((i) => i.name)).not.toContain(name);
    const trash = await listLocalTrash();
    const mine = trash.find((e) => e.id === name);
    expect(mine?.backend).toBe("local");
    expect(mine?.url).toBe(`/uploads/trash/${name}`);
    // 删除时间应为刚刚（utimes 刷新）
    expect(Date.now() - new Date(mine?.deletedAt ?? "0").getTime()).toBeLessThan(60_000);
    expect(mine?.daysLeft).toBe(TRASH_RETENTION_DAYS);
  });

  it("trashLocalImage：非法名/不存在返回 false", async () => {
    expect(await trashLocalImage("../evil.png")).toBe(false);
    expect(await trashLocalImage("no-such.png")).toBe(false);
  });

  it("restoreLocalImage：恢复回 uploads 根，回收站清空", async () => {
    const url = await saveImageFile("image/png", new Uint8Array([1]));
    const name = url.slice("/uploads/".length);
    await trashLocalImage(name);
    expect(await restoreLocalImage(name)).toBe(true);
    expect((await listLocalTrash()).map((e) => e.id)).not.toContain(name);
    expect((await listLocalImages()).map((i) => i.name)).toContain(name);
  });

  it("purgeLocalImage：物理删除回收站图片", async () => {
    const url = await saveImageFile("image/png", new Uint8Array([1]));
    const name = url.slice("/uploads/".length);
    await trashLocalImage(name);
    expect(await purgeLocalImage(name)).toBe(true);
    expect((await listLocalTrash()).map((e) => e.id)).not.toContain(name);
    expect(await purgeLocalImage(name)).toBe(false);
  });

  it("purgeExpiredLocal：仅清理超期图片", async () => {
    mkdirSync(localTrashDir(), { recursive: true });
    const stale = path.join(localTrashDir(), "11111111-1111-4111-8111-111111111111.png");
    writeFileSync(stale, "x");
    utimesSync(stale, daysAgo(15), daysAgo(15));
    const fresh = path.join(localTrashDir(), "22222222-2222-4222-8222-222222222222.png");
    writeFileSync(fresh, "x");
    utimesSync(fresh, daysAgo(3), daysAgo(3));
    expect(await purgeExpiredLocal()).toBe(1);
    const left = (await listLocalTrash()).map((e) => e.id);
    expect(left).toContain("22222222-2222-4222-8222-222222222222.png");
    expect(left).not.toContain("11111111-1111-4111-8111-111111111111.png");
  });

  it("purgeExpiredImages：未启用对象存储时跳过云端", async () => {
    const result = await purgeExpiredImages();
    expect(result).toEqual({ local: 0, remote: 0, remoteSkipped: true });
  });
});

describe("image-trash-service 云端", () => {
  beforeEach(() => {
    for (const fn of Object.values(storageMock)) fn.mockReset();
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
  });

  it("trashRemoteImage：Copy 进 trash/ 前缀后删源对象", async () => {
    await trashRemoteImage(storageRow, "acs/x.png");
    expect(storageMock.copyRemoteObject).toHaveBeenCalledWith(
      storageRow,
      "acs/x.png",
      "acs/trash/x.png",
    );
    expect(storageMock.deleteRemoteObject).toHaveBeenCalledWith(storageRow, "acs/x.png");
  });

  it("trashRemoteImage：越界 key 与重复删除抛错", async () => {
    await expect(trashRemoteImage(storageRow, "other/x.png")).rejects.toThrow("仅允许");
    storageMock.copyRemoteObject.mockResolvedValue(undefined);
    storageMock.deleteRemoteObject.mockResolvedValue(undefined);
    await expect(trashRemoteImage(storageRow, "acs/trash/y.png")).rejects.toThrow("已在回收站中");
  });

  it("restoreRemoteImage：Copy 回原 key 并删除回收站对象", async () => {
    await restoreRemoteImage(storageRow, "acs/trash/x.png");
    expect(storageMock.copyRemoteObject).toHaveBeenCalledWith(
      storageRow,
      "acs/trash/x.png",
      "acs/x.png",
    );
    expect(storageMock.deleteRemoteObject).toHaveBeenCalledWith(storageRow, "acs/trash/x.png");
    await expect(restoreRemoteImage(storageRow, "acs/x.png")).rejects.toThrow("仅允许");
  });

  it("purgeRemoteImage：仅允许回收站前缀内对象", async () => {
    await purgeRemoteImage(storageRow, "acs/trash/x.png");
    expect(storageMock.deleteRemoteObject).toHaveBeenCalledWith(storageRow, "acs/trash/x.png");
    await expect(purgeRemoteImage(storageRow, "acs/x.png")).rejects.toThrow("仅允许");
  });

  it("listRemoteTrash：映射删除时间与剩余天数", async () => {
    storageMock.listObjectsUnderPrefix.mockResolvedValue([
      {
        key: "acs/trash/x.png",
        url: "https://acs-media.example.com/acs/trash/x.png",
        size: 10,
        mtime: daysAgo(2).toISOString(),
      },
    ]);
    const entries = await (await import("./image-trash-service")).listRemoteTrash(storageRow);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("acs/trash/x.png");
    expect(entries[0].backend).toBe("remote");
    expect(entries[0].daysLeft).toBe(TRASH_RETENTION_DAYS - 2);
  });

  it("purgeExpiredRemote：仅删超期对象，单个失败不阻塞", async () => {
    storageMock.listObjectsUnderPrefix.mockResolvedValue([
      { key: "acs/trash/old.png", url: "u", size: 1, mtime: daysAgo(15).toISOString() },
      { key: "acs/trash/new.png", url: "u", size: 1, mtime: daysAgo(13).toISOString() },
      { key: "acs/trash/broken.png", url: "u", size: 1, mtime: daysAgo(20).toISOString() },
    ]);
    storageMock.deleteRemoteObject.mockImplementation(async (_row, key: string) => {
      if (key.endsWith("broken.png")) throw new Error("boom");
    });
    expect(await purgeExpiredRemote(storageRow)).toBe(1);
    expect(storageMock.deleteRemoteObject).toHaveBeenCalledWith(storageRow, "acs/trash/old.png");
    expect(storageMock.deleteRemoteObject).not.toHaveBeenCalledWith(
      storageRow,
      "acs/trash/new.png",
    );
  });
});

describe("isExpired 纯函数", () => {
  it("isExpired 纯函数：14 天整未过期，超过 1ms 即过期", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    expect(isExpired(new Date("2026-08-25T00:00:00Z"), now)).toBe(false); // 恰好 14 天
    expect(isExpired(new Date("2026-08-24T23:59:59.999Z"), now)).toBe(true); // 超 1ms
    expect(isExpired("2026-08-20T00:00:00Z", now)).toBe(true);
    expect(isExpired("2026-09-01T00:00:00Z", now)).toBe(false);
  });

  it("remoteTrashPrefix 拼接", () => {
    expect(remoteTrashPrefix("acs/")).toBe("acs/trash/");
    expect(remoteTrashPrefix("")).toBe("trash/");
  });
});
