import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteWechatConfig } from "@/lib/services/wechat-service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    await deleteWechatConfig(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除公众号配置失败";
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
