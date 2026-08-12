import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ingestSource, listSources } from "@/lib/services/source-service";
import { createSourceSchema, listSourcesSchema } from "@/lib/schemas/source";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const parsed = listSourcesSchema.safeParse({
      domain: searchParams.get("domain") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json(await listSources(parsed.data));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取来源失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const result = await ingestSource(parsed.data.url);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/URL|格式不合法|非法 URL|http\/https/.test(msg)) {
      return NextResponse.json({ error: "URL 校验失败", cause: msg }, { status: 400 });
    }
    return NextResponse.json({ cause: String(e), error: "抓取来源失败" }, { status: 500 });
  }
}
