import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generate } from "@/lib/ai";
import { generateSchema } from "@/lib/schemas/generate";
import { NoRouteError } from "@/lib/ai/router";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const result = await generate(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoRouteError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return NextResponse.json({ cause: String(e), error: "生成失败" }, { status: 500 });
  }
}
