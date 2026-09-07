// @vitest-environment node

import { File as NodeFile } from "node:buffer";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, storageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  storageMock: { getEnabledStorageConfig: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/services/storage-service", () => storageMock);

import { POST } from "./route";

describe("POST /api/uploads/image", () => {
  beforeEach(() => {
    // 默认未启用对象存储：上传落本地 public/uploads
    storageMock.getEnabledStorageConfig.mockResolvedValue(null);
  });
  afterEach(() => {
    const dir = path.join(process.cwd(), "public", "uploads");
    try {
      for (const f of readdirSync(dir)) rmSync(path.join(dir, f), { force: true });
    } catch {
      // 目录不存在则忽略
    }
  });

  function makeForm(file: NodeFile) {
    const form = new FormData();
    form.append("file", file as unknown as Blob);
    return new Request("https://localhost/api/uploads/image", {
      method: "POST",
      body: form,
    });
  }

  it("未登录返回 401", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeForm(new NodeFile(["x"], "a.png", { type: "image/png" })));
    expect(res.status).toBe(401);
  });

  it("png 上传成功：落盘 public/uploads 并返回 /uploads/xxx.png", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const file = new NodeFile(["png-bytes"], "photo.png", { type: "image/png" });
    const res = await POST(makeForm(file));
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    // 文件真实落盘
    const dir = path.join(process.cwd(), "public", "uploads");
    const files = readdirSync(dir);
    expect(files).toContain(path.basename(url));
  });

  it("非图片类型返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const res = await POST(makeForm(new NodeFile(["x"], "a.txt", { type: "text/plain" })));
    expect(res.status).toBe(400);
  });

  it("超过 10MB 返回 400", async () => {
    authMock.mockResolvedValue({ user: { email: "a@b.com" } });
    const big = new NodeFile([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });
    const res = await POST(makeForm(big));
    expect(res.status).toBe(400);
  });
});
