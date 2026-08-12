import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listRelayKeys, createRelayKey } from "@/lib/services/relay-service";
import { createRelayKeySchema } from "@/lib/schemas/relay";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.json(await listRelayKeys());
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取中转密钥失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createRelayKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const result = await createRelayKey(parsed.data.name);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "创建中转密钥失败" }, { status: 500 });
  }
}
