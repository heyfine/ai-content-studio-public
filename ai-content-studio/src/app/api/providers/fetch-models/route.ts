import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchModels } from "@/lib/services/provider-service";
import { providerTypeEnum } from "@/lib/schemas/provider";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const type = body?.type;
    const apiKey = body?.apiKey;
    if (!type || !apiKey) {
      return NextResponse.json({ error: "缺少 type 或 apiKey" }, { status: 400 });
    }
    if (!providerTypeEnum.options.includes(type)) {
      return NextResponse.json({ error: "未知供应商类型" }, { status: 400 });
    }
    const models = await fetchModels({
      type,
      baseUrl: typeof body.baseUrl === "string" && body.baseUrl ? body.baseUrl : undefined,
      apiKey,
    });
    return NextResponse.json({ models });
  } catch (e) {
    if (e instanceof Error && /Gemini/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ cause: String(e), error: "获取模型失败" }, { status: 500 });
  }
}
