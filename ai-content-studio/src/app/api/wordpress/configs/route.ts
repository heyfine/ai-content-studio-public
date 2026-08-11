import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createWordpressConfig, listWordpressConfigs } from "@/lib/services/wordpress-service";
import { wordpressConfigSchema } from "@/lib/schemas/wordpress";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const configs = await listWordpressConfigs();
    // 脱敏：绝不返回 appPassword（已加密入库，前端无需也不应接触）
    const safe = configs.map((c) => ({
      id: c.id,
      name: c.name,
      siteUrl: c.siteUrl,
      username: c.username,
      enabled: c.enabled,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    return NextResponse.json(safe);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取配置失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = wordpressConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const created = await createWordpressConfig(parsed.data);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "创建站点失败" }, { status: 500 });
  }
}
