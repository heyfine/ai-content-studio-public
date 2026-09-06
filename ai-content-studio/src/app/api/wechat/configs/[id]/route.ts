import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { wechatCoverUpdateSchema } from "@/lib/schemas/wechat";
import { deleteWechatConfig, updateWechatDefaultCover } from "@/lib/services/wechat-service";

/** 更新账号设置（当前仅默认封面；URL 变更即失效 media_id 缓存） */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const parsed = wechatCoverUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const updated = await updateWechatDefaultCover(id, parsed.data.defaultCoverUrl);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "更新公众号配置失败";
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}

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
