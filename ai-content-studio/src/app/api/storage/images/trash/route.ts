import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listRemoteTrash,
  purgeRemoteImage,
  restoreRemoteImage,
} from "@/lib/services/image-trash-service";
import { getEnabledStorageConfig } from "@/lib/services/storage-service";

/**
 * 图片库「云端回收站」区 API（key 含 / 不宜做路径参数，统一走 body）：
 * - GET：列举回收站前缀下的对象（删除时间/到期时间/剩余天数）
 * - POST：{ op: "restore" | "purge", key } 恢复回原 key / 彻底删除
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const storage = await getEnabledStorageConfig();
    if (!storage) {
      return NextResponse.json({ enabled: false, images: [] });
    }
    const images = await listRemoteTrash(storage);
    return NextResponse.json({ enabled: true, name: storage.name, images });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取云端回收站失败" }, { status: 500 });
  }
}

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
    const body = (await request.json().catch(() => ({}))) as { op?: string; key?: string };
    if (!body.key || typeof body.key !== "string") {
      return NextResponse.json({ error: "缺少 key 参数" }, { status: 400 });
    }
    if (body.op === "restore") {
      await restoreRemoteImage(storage, body.key);
      return NextResponse.json({ ok: true });
    }
    if (body.op === "purge") {
      await purgeRemoteImage(storage, body.key);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "云端回收站操作失败";
    const status = message.startsWith("仅允许") || message.startsWith("回收站对象") ? 403 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
