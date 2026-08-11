import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listArticles } from "@/lib/services/article-service";
import { isStaleArticle, stalenessReasons, type StalenessOptions } from "@/lib/article-staleness";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const opts: StalenessOptions = {};
    const maxAgeDays = searchParams.get("maxAgeDays");
    const lowSeo = searchParams.get("lowSeoThreshold");
    if (maxAgeDays) opts.maxAgeDays = Number(maxAgeDays);
    if (lowSeo) opts.lowSeoThreshold = Number(lowSeo);

    const all = await listArticles();
    const candidates = all
      .filter((a) => isStaleArticle({ updatedAt: a.updatedAt, seoScore: a.seoScore }, opts))
      .sort((a, b) => {
        const sa = a.seoScore ?? 100;
        const sb = b.seoScore ?? 100;
        if (sa !== sb) return sa - sb;
        return a.updatedAt.getTime() - b.updatedAt.getTime();
      })
      .map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        seoScore: a.seoScore,
        updatedAt: a.updatedAt,
        staleReasons: stalenessReasons({ updatedAt: a.updatedAt, seoScore: a.seoScore }, opts),
      }));

    return NextResponse.json(candidates);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取候选项失败" }, { status: 500 });
  }
}
