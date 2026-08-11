import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWorkflow } from "@/lib/services/workflow-service";
import { workflowRunSchema } from "@/lib/schemas/workflow";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await request.json();
    const parsed = workflowRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "校验失败", issues: parsed.error.issues }, { status: 400 });
    }
    const { run, result } = await runWorkflow(parsed.data.topic, {
      configId: parsed.data.configId,
      promptId: parsed.data.promptId,
      wpStatus: parsed.data.wpStatus,
    });
    return NextResponse.json({
      run: {
        id: run.id,
        topic: run.topic,
        status: run.status,
        articleId: run.articleId,
        error: run.error,
        steps: run.steps,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      result: {
        status: result.status,
        reason: result.reason,
        steps: result.steps,
      },
    });
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "工作流执行失败" }, { status: 500 });
  }
}
