import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticle, updateArticle, deleteArticle } from "@/lib/services/article-service";
import { updateArticleSchema } from "@/lib/schemas/article";
import { publishArticle } from "@/lib/services/wordpress-service";
import { decrypt } from "@/lib/crypto";
import { renderArticleContent } from "@/lib/content/render";

function isTransitionError(e: unknown) {
  return e instanceof Error && /非法状态转换/.test(e.message);
}
function isNotFound(e: unknown) {
  return e instanceof Error && /文章不存在/.test(e.message);
}

/**
 * 在更新或删除文章时，同步到 WordPress（如果是博客同步的文章）
 */
async function syncToWordPress(articleId: string, article: { siteConfigId: string | null; wpPostId: string | null; status: string; title: string; content: string }) {
  if (!article.siteConfigId || !article.wpPostId) {
    return; // 不是从博客同步的文章，无需同步
  }

  try {
    // 状态映射：PUBLISHED → publish，其他 → draft
    const wpStatus = article.status === "PUBLISHED" ? "publish" : "draft";

    // 调用 publishArticle 同步到 WordPress
    const result = await publishArticle(articleId, article.siteConfigId, wpStatus as "publish" | "draft");

    // 更新本地文章的最后同步时间
    await updateArticle(articleId, {
      syncStatus: "SYNCED",
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("同步到 WordPress 失败:", error);
    // 不抛出错误，只记录日志，避免影响主流程
  }
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
    const { id } = await ctx.params;

    // 先获取文章信息，检查是否是博客同步的文章
    const articleBefore = await getArticle(id);
    if (!articleBefore) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }

    // 执行更新
    const updatedArticle = await updateArticle(id, parsed.data);

    // 如果是从博客同步的文章，同步到 WordPress
    await syncToWordPress(id, updatedArticle);

    return NextResponse.json(updatedArticle);
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

    // 先获取文章信息，检查是否是博客同步的文章
    const article = await getArticle(id);
    if (!article) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    // 如果是从博客同步的文章，同步删除到 WordPress
    await syncToWordPress(id, article);

    // 执行删除
    return NextResponse.json(await deleteArticle(id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/记录不存在|P2025/.test(msg)) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "删除文章失败" }, { status: 500 });
  }
}
