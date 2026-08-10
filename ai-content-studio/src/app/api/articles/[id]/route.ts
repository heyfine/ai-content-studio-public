import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticle, updateArticle, deleteArticle } from "@/lib/services/article-service";
import { updateArticleSchema } from "@/lib/schemas/article";

function isTransitionError(e: unknown) {
  return e instanceof Error && /非法状态转换/.test(e.message);
}
function isNotFound(e: unknown) {
  return e instanceof Error && /文章不存在/.test(e.message);
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const article = await getArticle(id);
    if (!article) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    return NextResponse.json(article);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取文章失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = updateArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await updateArticle(id, parsed.data));
  } catch (e) {
    if (isNotFound(e)) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    if (isTransitionError(e)) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "非法状态转换" },
        { status: 409 },
      );
    }
    return NextResponse.json({ cause: String(e), error: "更新文章失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await deleteArticle(id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/记录不存在|P2025/.test(msg)) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "删除文章失败" }, { status: 500 });
  }
}
