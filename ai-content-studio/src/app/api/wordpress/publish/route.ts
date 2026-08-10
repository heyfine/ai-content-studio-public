import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishArticle, unpublishArticle } from "@/lib/services/wordpress-service";
import { wordpressPublishSchema } from "@/lib/schemas/wordpress";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = wordpressPublishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const result = await publishArticle(
      parsed.data.articleId,
      parsed.data.configId,
      parsed.data.wpStatus,
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && /文章不存在|WordPress 站点不可用|未配置/.test(e.message)) {
      const status = /文章不存在/.test(e.message) ? 404 : /未配置/.test(e.message) ? 400 : 404;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json({ cause: String(e), error: "发布失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId");
    const configId = searchParams.get("configId") ?? undefined;
    if (!articleId) {
      return NextResponse.json({ error: "缺少 articleId" }, { status: 400 });
    }
    const result = await unpublishArticle(articleId, configId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && (/尚未发布/.test(e.message) || /文章不存在/.test(e.message))) {
      const status = /文章不存在/.test(e.message) ? 404 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json({ cause: String(e), error: "撤销发布失败" }, { status: 500 });
  }
}
