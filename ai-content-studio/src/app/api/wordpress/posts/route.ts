import { NextRequest, NextResponse } from "next/server";
import { fetchBlogPosts } from "@/lib/services/wordpress-service";
import { auth } from "@/lib/auth";

/**
 * GET /api/wordpress/posts
 * 获取博客文章列表
 */
export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    await auth();

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get("configId");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");
    const status = searchParams.get("status");

    if (!configId) {
      return NextResponse.json(
        { error: "请提供博客站点 ID" },
        { status: 400 }
      );
    }

    const posts = await fetchBlogPosts(configId, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      status: status as "publish" | "draft" | "all" | undefined,
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("获取博客文章列表失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取博客文章列表失败" },
      { status: 500 }
    );
  }
}