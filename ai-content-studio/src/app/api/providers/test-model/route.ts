import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testProviderModel } from "@/lib/services/provider-service";

/** 逐模型连通测试：表单明文凭证优先（type/apiKey/baseUrl），编辑已有供应商可只传 providerId 复用库存 Key */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const result = await testProviderModel({
      providerId: typeof body?.providerId === "string" ? body.providerId : undefined,
      type: typeof body?.type === "string" ? body.type : undefined,
      baseUrl: typeof body?.baseUrl === "string" ? body.baseUrl : undefined,
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : undefined,
      model: typeof body?.model === "string" ? body.model : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, latencyMs: 0, error: e instanceof Error ? e.message : "测试失败" },
      { status: 500 },
    );
  }
}
