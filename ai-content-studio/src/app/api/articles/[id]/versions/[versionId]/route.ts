import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteVersion, getVersion } from "@/lib/services/article-version-service";

/** 单个版本详情（预览用，含正文） */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id, versionId } = await ctx.params;
    const version = await getVersion(id, versionId);
    if (!version) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }
    return NextResponse.json(version);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取版本失败" }, { status: 500 });
  }
}

/** 删除单个版本 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id, versionId } = await ctx.params;
    await deleteVersion(id, versionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除版本失败";
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
