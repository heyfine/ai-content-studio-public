import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchModels, getProvider, toProviderConfig } from "@/lib/services/provider-service";
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
    const providerId = body?.providerId;
    const baseUrl = typeof body.baseUrl === "string" && body.baseUrl ? body.baseUrl : undefined;

    // 编辑已有供应商：传 providerId 用库里的加密 Key 解密后拉取（无需重新输入 Key）
    if (providerId) {
      const row = await getProvider(providerId);
      if (!row) return NextResponse.json({ error: "供应商不存在" }, { status: 404 });
      if (row.type === "GEMINI") {
        return NextResponse.json({ error: "Gemini 适配器将在后续 Phase 接入" }, { status: 400 });
      }
      const models = await fetchModels(toProviderConfig(row));
      return NextResponse.json({ models });
    }

    // 新增场景：需明文凭证
    if (!type || !apiKey) {
      return NextResponse.json({ error: "缺少 providerId 或 type/apiKey" }, { status: 400 });
    }
    if (!providerTypeEnum.options.includes(type)) {
      return NextResponse.json({ error: "未知供应商类型" }, { status: 400 });
    }
    const models = await fetchModels({ type, baseUrl, apiKey });
    return NextResponse.json({ models });
  } catch (e) {
    if (e instanceof Error && /Gemini/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ cause: String(e), error: "获取模型失败" }, { status: 500 });
  }
}
