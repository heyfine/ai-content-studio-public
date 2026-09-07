import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** 粘贴图片上传：把编辑器粘贴进来的图片落盘到 public/uploads，返回可公网访问的 URL */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const form = await request.formData();
    const file = form.get("file");
    // 鸭子类型判断：jsdom/undici 的 File 类不同，instanceof 在测试与运行环境会失配
    if (!file || typeof (file as File).arrayBuffer !== "function") {
      return NextResponse.json({ error: "缺少图片文件" }, { status: 400 });
    }
    const imageFile = file as File;
    const ext = EXT_BY_TYPE[imageFile.type];
    if (!ext) {
      return NextResponse.json(
        { error: `不支持的图片类型：${imageFile.type || "未知"}` },
        { status: 400 },
      );
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `图片需小于 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB` },
        { status: 400 },
      );
    }
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}${ext}`;
    await writeFile(path.join(dir, filename), Buffer.from(await imageFile.arrayBuffer()));
    return NextResponse.json({ url: `/uploads/${filename}` }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "图片上传失败" }, { status: 500 });
  }
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** content-type → 落盘扩展名白名单（仅常见图片格式） */
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
