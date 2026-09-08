import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listLocalTrash,
  purgeExpiredImages,
  purgeLocalImage,
  purgeLocalImages,
  restoreLocalImage,
  restoreLocalImages,
} from "@/lib/services/image-trash-service";

/**
 * 本地图片回收站 API：
 * - GET：回收站列表（删除时间 / 到期时间 / 剩余天数）
 * - POST：op=restore | purge（恢复 / 彻底删除，body.name 单条或 body.names 批量）
 *   | op=purge-expired（立即清理过期项）
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.json(await listLocalTrash());
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取回收站列表失败" }, { status: 500 });
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      op?: string;
      name?: string;
      names?: unknown;
    };
    if (body.op === "purge-expired") {
      const result = await purgeExpiredImages();
      return NextResponse.json({ ok: true, ...result });
    }
    const isBatch = isStringArray(body.names);
    if (!isBatch && (!body.name || typeof body.name !== "string")) {
      return NextResponse.json({ error: "缺少 name 参数" }, { status: 400 });
    }
    const names: string[] = isBatch ? (body.names as string[]) : [body.name as string];
    if (body.op === "restore") {
      if (isBatch) {
        return NextResponse.json({ results: await restoreLocalImages(names) });
      }
      const ok = await restoreLocalImage(names[0] as string);
      if (!ok) {
        return NextResponse.json({ error: "回收站中不存在该图片" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    if (body.op === "purge") {
      if (isBatch) {
        return NextResponse.json({ results: await purgeLocalImages(names) });
      }
      const ok = await purgeLocalImage(names[0] as string);
      if (!ok) {
        return NextResponse.json({ error: "回收站中不存在该图片" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "回收站操作失败" }, { status: 500 });
  }
}
