import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importImageFromUrl } from "@/lib/services/image-upload-service";

/** 把外部图片转存到本地图片库（文章外部图「转存到本地」） */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    if (!body.url || !/^https?:\/\//.test(body.url)) {
      return NextResponse.json({ error: "请提供 http(s) 图片 URL" }, { status: 400 });
    }
    const url = await importImageFromUrl(body.url);
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "转存失败";
    const status = message.includes("不支持") || message.includes("小于") ? 400 : 500;
    return NextResponse.json({ cause: String(e), error: message }, { status });
  }
}
