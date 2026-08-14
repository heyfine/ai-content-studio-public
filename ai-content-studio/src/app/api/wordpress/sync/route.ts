import { NextRequest, NextResponse } from "next/server";
import { syncBlogPosts } from "@/lib/services/wordpress-service";
import { auth } from "@/lib/auth";

/**
 * POST /api/wordpress/sync
 * 同步博客文章到本地数据库
 */
export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    await auth();

    const body = await request.json();
    const { configId, limit, offset, status } = body;

    if (!configId) {
      return NextResponse.json(
        { error: "请提供博客站点 ID" },
        { status: 400 }
      );
    }

    const result = await syncBlogPosts({
      configId,
      limit,
      offset,
      status,
    });

    return NextResponse.json({
      success: true,
      synced: result.synced,
      conflicts: result.conflicts,
      errors: result.errors,
      details: result.details,
    });
  } catch (error) {
    console.error("同步博客文章失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步博客文章失败" },
      { status: 500 }
    );
  }
}