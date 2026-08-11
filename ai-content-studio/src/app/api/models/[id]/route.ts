import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { updateModel } from "@/lib/services/model-service";

const updateModelSchema = z.object({
  displayName: z.string().min(1).optional(),
  contextLength: z.number().int().positive().nullish(),
  inputPrice: z.number().nonnegative().nullish(),
  outputPrice: z.number().nonnegative().nullish(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = updateModelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const { id } = await ctx.params;
    return NextResponse.json(await updateModel(id, parsed.data));
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "更新模型失败" }, { status: 500 });
  }
}
