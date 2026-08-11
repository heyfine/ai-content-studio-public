import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listWorkflowRuns } from "@/lib/services/workflow-service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const runs = await listWorkflowRuns();
    return NextResponse.json(runs);
  } catch (e) {
    return NextResponse.json({ cause: String(e), error: "获取工作流列表失败" }, { status: 500 });
  }
}
