import { NextRequest, NextResponse } from "next/server";
import { resolveArticleConflict } from "@/lib/services/wordpress-service";
import { auth } from "@/lib/auth";

/**
 * POST /api/articles/[id]/resolve-conflict
 * 解决文章冲突
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    await auth();

    const { id } = await ctx.params;
    const body = await request.json();
    const { strategy } = body;

    if (!strategy || (strategy !== "local" && strategy !== "remote")) {
      return NextResponse.json(
        { error: "无效的策略，必须是 'local' 或 'remote'" },
        { status: 400 }
      );
    }

    await resolveArticleConflict(id, strategy);

    return NextResponse.json({
      success: true,
      message: "冲突已解决",
    });
  } catch (error) {
    console.error("解决文章冲突失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解决冲突失败" },
      { status: 500 }
    );
  }
}