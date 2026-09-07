import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteStorageConfig } from "@/lib/services/storage-service";

/** 删除存储配置（不影响已上传到对象存储的历史文件） */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    await deleteStorageConfig(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "删除存储配置失败" }, { status: 500 });
  }
}
