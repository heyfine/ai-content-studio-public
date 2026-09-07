import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteLocalImage } from "@/lib/services/image-upload-service";

/** 删除本地图片库中的一张图片 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { name } = await ctx.params;
    const ok = await deleteLocalImage(name);
    if (!ok) {
      return NextResponse.json({ error: "图片不存在或文件名不合法" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除图片失败" }, { status: 500 });
  }
}
