import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { suggestLayout } from "@/lib/services/layout-suggest-service";
import { isLayoutStyle } from "@/lib/content/layout-suggest-types";

/**
 * POST /api/articles/suggest-layout
 * Body: { content: string, title?: string, style?: "minimal" | "standard" | "emphasis" }
 * Returns: { suggestions: LayoutSuggestion[] }
 *
 * 调 AI 分析文章正文，返回排版建议（不修改正文）。
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = (await request.json()) as {
      content?: string;
      title?: string;
      style?: string;
    };
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json({ error: "正文不能为空" }, { status: 400 });
    }
    if (body.content.length > 20000) {
      return NextResponse.json({ error: "正文过长（上限 2 万字）" }, { status: 400 });
    }
    const style = isLayoutStyle(body.style) ? body.style : "standard";

    const { suggestions } = await suggestLayout({
      content: body.content,
      title: body.title,
      style,
    });

    return NextResponse.json({ suggestions, style });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/NoRouteError|no.*route|路由/.test(message)) {
      return NextResponse.json(
        { error: "未配置 AI 模型路由，请先在 AI 模型页面配置" },
        { status: 404 },
      );
    }
    return NextResponse.json({ cause: message, error: "AI 排版建议失败" }, { status: 500 });
  }
}
