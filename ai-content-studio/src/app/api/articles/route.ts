import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createArticleSchema } from "@/lib/schemas/article";
import { createArticle, listArticles, listTrashedArticles } from "@/lib/services/article-service";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const trashed = searchParams.get("trashed") === "true";
    if (trashed) {
      return NextResponse.json(await listTrashedArticles());
    }
    return NextResponse.json(await listArticles(status as Parameters<typeof listArticles>[0]));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取文章失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json(await createArticle(parsed.data), { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "创建文章失败" }, { status: 500 });
  }
}
