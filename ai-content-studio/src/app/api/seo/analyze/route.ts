import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeRaw, analyzeAndSave } from "@/lib/services/seo-service";
import { seoAnalyzeSchema } from "@/lib/schemas/seo";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = seoAnalyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;
    if (data.articleId) {
      return NextResponse.json(await analyzeAndSave(data.articleId));
    }
    const r = await analyzeRaw({
      title: data.title ?? "",
      content: data.content ?? "",
      metaDescription: data.metaDescription,
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof Error && /文章不存在/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "SEO 分析失败" }, { status: 500 });
  }
}
