import { NextRequest, NextResponse } from "next/server";
import { checkArticleSyncStatus } from "@/lib/services/wordpress-service";
import { auth } from "@/lib/auth";

/**
 * GET /api/articles/[id]/sync-status
 * 检查文章的同步状态和冲突
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    await auth();

    const { id } = await ctx.params;
    const data = await checkArticleSyncStatus(id);

    return NextResponse.json({
      hasConflict: data.hasConflict,
      wpModified: data.wpModified?.toISOString(),
      localModified: data.localModified.toISOString(),
    });
  } catch (error) {
    console.error("检查文章同步状态失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "检查失败" },
      { status: 500 }
    );
  }
}