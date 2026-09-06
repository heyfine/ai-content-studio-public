import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVersions } from "@/lib/services/article-version-service";

/** 文章历史版本列表（不含正文；size 为正文字符数） */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await listVersions(id));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取版本列表失败" }, { status: 500 });
  }
}
