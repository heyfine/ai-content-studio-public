import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trashRemoteImages } from "@/lib/services/image-trash-service";
import { getEnabledStorageConfig } from "@/lib/services/storage-service";

/** 批量删除云端图片（移入回收站前缀）：POST { keys: string[] } */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const storage = await getEnabledStorageConfig();
    if (!storage) {
      return NextResponse.json({ error: "未启用对象存储" }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as { keys?: unknown };
    if (
      !Array.isArray(body.keys) ||
      body.keys.length === 0 ||
      !body.keys.every((k) => typeof k === "string")
    ) {
      return NextResponse.json({ error: "缺少 keys 参数" }, { status: 400 });
    }
    const results = await trashRemoteImages(storage, body.keys as string[]);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "批量删除失败" }, { status: 500 });
  }
}
