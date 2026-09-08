import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trashRemoteImage } from "@/lib/services/image-trash-service";
import { getEnabledStorageConfig } from "@/lib/services/storage-service";

/** 删除云端图片（移入回收站前缀，14 天后自动清理） */
export async function DELETE(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const storage = await getEnabledStorageConfig();
    if (!storage) {
      return NextResponse.json({ error: "未启用对象存储" }, { status: 400 });
    }
    const { key } = await ctx.params;
    const decoded = decodeURIComponent(key);
    await trashRemoteImage(storage, decoded);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除云端图片失败";
    const status = message.startsWith("仅允许")
      ? 403
      : message.includes("已在回收站中")
        ? 409
        : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
