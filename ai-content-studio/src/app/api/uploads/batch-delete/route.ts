import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trashLocalImages } from "@/lib/services/image-trash-service";

/** 批量删除本地图片（移入回收站）：POST { names: string[] } */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { names?: unknown };
    if (
      !Array.isArray(body.names) ||
      body.names.length === 0 ||
      !body.names.every((n) => typeof n === "string")
    ) {
      return NextResponse.json({ error: "缺少 names 参数" }, { status: 400 });
    }
    const results = await trashLocalImages(body.names as string[]);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "批量删除失败" }, { status: 500 });
  }
}
