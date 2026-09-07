// @vitest-environment node
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getEnabledStorageConfig: vi.fn(),
    putObject: vi.fn(),
  },
}));

vi.mock("@/lib/services/storage-service", () => storageMock);

import {
  deleteLocalImage,
  importImageFromUrl,
  listLocalImages,
  saveImageFile,
  uploadDir,
} from "./image-upload-service";

const storageRow = {
  id: "s1",
  name: "缤纷云",
  endpoint: "https://s3.example.com",
  region: "auto",
  bucket: "acs-media",
  accessKeyId: "AKID",
  secretKey: "enc",
  publicBase: "https://acs-media.example.com",
  keyPrefix: "acs/",
  enabled: true,
};

function cleanUploads() {
  try {
    for (const f of readdirSync(uploadDir())) rmSync(path.join(uploadDir(), f), { force: true });
  } catch {
    // 目录不存在则忽略
  }
}

describe("image-upload-service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // 每用例重置并回落到「未启用对象存储」的本地行为基线
    storageMock.getEnabledStorageConfig.mockReset();
    storageMock.putObject.mockReset();
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanUploads();
  });

  it("saveImageFile：按类型落盘并返回公网相对路径", async () => {
    const url = await saveImageFile("image/png", new Uint8Array([1, 2, 3]));
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(readdirSync(uploadDir())).toContain(url.slice("/uploads/".length));
  });

  it("saveImageFile：不支持的类型抛错", async () => {
    await expect(saveImageFile("text/plain", new Uint8Array([1]))).rejects.toThrow(/不支持/);
  });

  it("saveImageFile：超 10MB 抛错", async () => {
    await expect(saveImageFile("image/png", new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow(
      /小于/,
    );
  });

  it("listLocalImages：只列白名单图片并带大小/时间，按修改时间倒序", async () => {
    await saveImageFile("image/png", new Uint8Array([1]));
    const entries = await listLocalImages();
    expect(entries.length).toBe(1);
    expect(entries[0].url).toMatch(/^\/uploads\/.+\.png$/);
    expect(entries[0].size).toBe(1);
  });

  it("deleteLocalImage：合法文件名删除，非法名与不存在返回 false", async () => {
    const url = await saveImageFile("image/png", new Uint8Array([1]));
    const name = url.slice("/uploads/".length);
    expect(await deleteLocalImage(name)).toBe(true);
    expect(await deleteLocalImage(name)).toBe(false);
    expect(await deleteLocalImage("../evil.png")).toBe(false);
  });

  it("importImageFromUrl：下载外部图片转存为本地", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([9, 9]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
    ) as unknown as typeof fetch;
    const url = await importImageFromUrl("https://cdn.example.com/a.jpg");
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
  });

  it("importImageFromUrl：非图片类型抛错", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("html", { status: 200, headers: { "Content-Type": "text/html" } }),
    ) as unknown as typeof fetch;
    await expect(importImageFromUrl("https://cdn.example.com/a.html")).rejects.toThrow(/不支持/);
  });

  it("S3 启用时 saveImageFile 分流：直传云桶返回公网 URL，key 带前缀", async () => {
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    storageMock.putObject.mockResolvedValue("https://acs-media.example.com/acs/abc.png");
    const url = await saveImageFile("image/png", new Uint8Array([1, 2, 3]));
    expect(url).toBe("https://acs-media.example.com/acs/abc.png");
    expect(readdirSync(uploadDir()).length).toBe(0);
    const [, key, bytes, contentType] = storageMock.putObject.mock.calls[0] as [
      typeof storageRow,
      string,
      Uint8Array,
      string,
    ];
    expect(key).toMatch(/^acs\/[0-9a-f-]{36}\.png$/);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(contentType).toBe("image/png");
  });

  it("S3 启用时 importImageFromUrl 同样转存到云桶", async () => {
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    storageMock.putObject.mockResolvedValue("https://acs-media.example.com/acs/x.jpg");
    globalThis.fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([9, 9]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
    ) as unknown as typeof fetch;
    const url = await importImageFromUrl("https://cdn.example.com/a.jpg");
    expect(url).toBe("https://acs-media.example.com/acs/x.jpg");
    const [, , , contentType] = storageMock.putObject.mock.calls[0] as [
      typeof storageRow,
      string,
      Uint8Array,
      string,
    ];
    expect(contentType).toBe("image/jpeg");
  });

  it("超限校验在 S3 分流前同样生效", async () => {
    storageMock.getEnabledStorageConfig.mockResolvedValue(storageRow);
    await expect(saveImageFile("image/png", new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow(
      /小于/,
    );
    expect(storageMock.putObject).not.toHaveBeenCalled();
  });
});
