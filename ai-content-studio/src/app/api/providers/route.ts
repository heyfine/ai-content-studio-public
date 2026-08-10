import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listProviders, createProvider } from "@/lib/services/provider-service";
import { createProviderSchema } from "@/lib/schemas/provider";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.json(await listProviders());
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取供应商失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createProviderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json(await createProvider(parsed.data), { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "创建供应商失败" }, { status: 500 });
  }
}
