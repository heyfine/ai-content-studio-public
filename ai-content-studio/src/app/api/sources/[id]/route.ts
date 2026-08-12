import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteSource, getSource } from "@/lib/services/source-service";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const source = await getSource(id);
    if (!source) {
      return NextResponse.json({ error: "来源不存在" }, { status: 404 });
    }
    return NextResponse.json(source);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取来源失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await deleteSource(id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/记录不存在|P2025/.test(msg)) {
      return NextResponse.json({ error: "来源不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "删除来源失败" }, { status: 500 });
  }
}
