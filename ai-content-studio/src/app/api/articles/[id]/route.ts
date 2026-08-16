import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getArticle,
  updateArticle,
  trashArticle,
  purgeArticle,
} from "@/lib/services/article-service";
import { updateArticleSchema } from "@/lib/schemas/article";
import {
  publishArticle,
  trashWordPressPost,
  unpublishArticle,
} from "@/lib/services/wordpress-service";
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

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const permanent = new URL(request.url).searchParams.get("permanent") === "true";

    if (permanent) {
      // 永久删除：先从博客侧彻底删除，再删本地
      let wpDeleted = false;
      let wpError: string | undefined;
      if (article.siteConfigId && article.wpPostId) {
        try {
          await unpublishArticle(id, article.siteConfigId);
          wpDeleted = true;
        } catch (e) {
          wpError = e instanceof Error ? e.message : String(e);
        }
      }
      await purgeArticle(id);
      return NextResponse.json({ ...article, deleted: true, permanent: true, wpDeleted, wpError });
    }

    // 移入回收站：本地先软删（确保操作即时生效），再同步博客到回收站
    const trashed = await trashArticle(id);
    // 是否博客文章；本地文章（无 siteConfigId/wpPostId）不涉及博客同步
    const isBlogArticle = Boolean(article.siteConfigId && article.wpPostId);
    let wpSynced: boolean | undefined;
    let wpError: string | undefined;
    if (isBlogArticle && article.siteConfigId) {
      try {
        await trashWordPressPost(id, article.siteConfigId);
        wpSynced = true;
      } catch (e) {
        wpSynced = false;
        wpError = e instanceof Error ? e.message : String(e);
      }
    }
    return NextResponse.json({ ...trashed, trashed: true, permanent: false, wpSynced, wpError });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/记录不存在|P2025/.test(msg)) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "删除文章失败" }, { status: 500 });
  }
}
