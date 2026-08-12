import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshSource } from "@/lib/services/source-service";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await refreshSource(id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/来源不存在/.test(msg)) {
      return NextResponse.json({ error: "来源不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "刷新来源失败" }, { status: 500 });
  }
}