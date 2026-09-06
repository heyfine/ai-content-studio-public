import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { restoreVersion } from "@/lib/services/article-version-service";

/** 恢复版本：写回文章内容（恢复前的当前状态自动存档，可再撤销） */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id, versionId } = await ctx.params;
    await restoreVersion(id, versionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "恢复版本失败";
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
