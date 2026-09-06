import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { duplicateArticle } from "@/lib/services/article-service";

/** 复制文章为副本（标题加「（副本）」，状态重置草稿，发布字段不复制） */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const copy = await duplicateArticle(id);
    return NextResponse.json({ id: copy.id, title: copy.title }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "复制文章失败";
    const status = message.includes("不存在") ? 404 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
