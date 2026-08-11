import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshArticle, type RefreshOptions } from "@/lib/services/refresh-service";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    let opts: RefreshOptions = {};
    try {
      const body = await request.json();
      if (body && typeof body === "object") {
        const b = body as {
          systemPrompt?: string;
          temperature?: number;
          maxTokens?: number;
        };
        opts = {
          systemPrompt: b.systemPrompt,
          temperature: typeof b.temperature === "number" ? b.temperature : undefined,
          maxTokens: typeof b.maxTokens === "number" ? b.maxTokens : undefined,
        };
      }
    } catch {
      // 无 body 或非法 JSON 时不报错，用默认 opts
    }
    const { id } = await ctx.params;
    const result = await refreshArticle(id, opts);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && /文章不存在/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    if (e instanceof Error && /未配置任务路由|模型不可用/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ cause: String(e), error: "刷新文章失败" }, { status: 500 });
  }
}
