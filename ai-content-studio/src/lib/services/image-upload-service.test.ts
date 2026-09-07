// @vitest-environment node
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteLocalImage,
  importImageFromUrl,
  listLocalImages,
  saveImageFile,
  uploadDir,
} from "./image-upload-service";

function cleanUploads() {
  try {
    for (const f of readdirSync(uploadDir())) rmSync(path.join(uploadDir(), f), { force: true });
  } catch {
    // 目录不存在则忽略
  }
}

describe("image-upload-service", () => {
  const originalFetch = globalThis.fetch;

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
});
