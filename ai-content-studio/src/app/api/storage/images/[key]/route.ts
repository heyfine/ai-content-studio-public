import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteRemoteObject, getEnabledStorageConfig } from "@/lib/services/storage-service";

/** 删除云端对象：仅允许删除配置 keyPrefix 下的对象，防误删桶内其他文件 */
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
    if (!decoded.startsWith(storage.keyPrefix) || decoded.includes("..")) {
      return NextResponse.json({ error: "仅允许删除本应用前缀下的对象" }, { status: 403 });
    }
    await deleteRemoteObject(storage, decoded);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除云端图片失败" }, { status: 500 });
  }
}
