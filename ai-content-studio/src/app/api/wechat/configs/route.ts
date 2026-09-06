import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { wechatConfigSchema } from "@/lib/schemas/wechat";
import { createWechatConfig, listWechatConfigs } from "@/lib/services/wechat-service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const configs = await listWechatConfigs();
    // 脱敏：绝不返回 appSecret（已加密入库，前端无需也不应接触）
    const safe = configs.map((c) => ({
      id: c.id,
      name: c.name,
      appId: c.appId,
      defaultCoverUrl: c.defaultCoverUrl,
      enabled: c.enabled,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    return NextResponse.json(safe);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取公众号配置失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = wechatConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const created = await createWechatConfig(parsed.data);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "创建公众号配置失败" }, { status: 500 });
  }
}
