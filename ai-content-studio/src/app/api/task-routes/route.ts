import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  listTaskRoutes,
  upsertTaskRoute,
  listRouteableModels,
} from "@/lib/services/task-route-service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.json({
      routes: await listTaskRoutes(),
      models: await listRouteableModels(),
    });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取路由失败" }, { status: 500 });
  }
}

const upsertSchema = z.object({
  task: z.string().min(1),
  modelId: z.string().min(1),
});

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    return NextResponse.json(await upsertTaskRoute(parsed.data.task, parsed.data.modelId));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "保存路由失败" }, { status: 500 });
  }
}
