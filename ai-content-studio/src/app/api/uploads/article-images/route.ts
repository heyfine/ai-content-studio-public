import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractImageUrls, isLocalImageUrl } from "@/lib/content/image-urls";
import { prisma } from "@/lib/prisma";

export interface ArticleImageGroup {
  articleId: string;
  title: string;
  images: Array<{ src: string; local: boolean }>;
}

/** 图片库「文章图片」区：扫描全部文章正文，聚合每篇用到的图片（自动保存/按文章查看） */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const articles = await prisma.article.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, content: true },
    });
    const groups: ArticleImageGroup[] = [];
    for (const a of articles) {
      const urls = extractImageUrls(a.content);
      if (urls.length === 0) continue;
      groups.push({
        articleId: a.id,
        title: a.title,
        images: urls.map((src) => ({ src, local: isLocalImageUrl(src) })),
      });
    }
    return NextResponse.json(groups);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取文章图片失败" }, { status: 500 });
  }
}
