import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePastedImage, uploadPastedImage } from "./paste-image";

describe("normalizePastedImage", () => {
  it("非 bmp 原样返回", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    expect(await normalizePastedImage(file)).toBe(file);
  });

  it("bmp 在无 canvas 环境回退原样（jsdom 无 createImageBitmap/canvas）", async () => {
    const file = new File(["bmp"], "w.bmp", { type: "image/bmp" });
    expect(await normalizePastedImage(file)).toBe(file);
  });
});

describe("uploadPastedImage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POST /api/uploads/image 携带 multipart 文件，返回 url", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      return Response.json({ url: "/uploads/abc.png" }, { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(uploadPastedImage(file)).resolves.toBe("/uploads/abc.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/image",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("上传失败抛中文错误", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ error: "图片上传失败" }, { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      uploadPastedImage(new File(["x"], "a.png", { type: "image/png" })),
    ).rejects.toThrow("图片上传失败");
  });
});
