import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticle, restoreArticle } from "@/lib/services/article-service";
import { untrashWordPressPost } from "@/lib/services/wordpress-service";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
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

    // 本地先恢复，再同步博客侧移出回收站
    const restored = await restoreArticle(id);
    let wpSynced = false;
    let wpError: string | undefined;
    if (article.siteConfigId && article.wpPostId) {
      try {
        const wpStatus: "publish" | "draft" = restored.status === "PUBLISHED" ? "publish" : "draft";
        await untrashWordPressPost(id, article.siteConfigId, wpStatus);
        wpSynced = true;
      } catch (e) {
        wpError = e instanceof Error ? e.message : String(e);
      }
    }
    return NextResponse.json({ ...restored, restored: true, wpSynced, wpError });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/记录不存在|P2025/.test(msg)) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "恢复文章失败" }, { status: 500 });
  }
}
