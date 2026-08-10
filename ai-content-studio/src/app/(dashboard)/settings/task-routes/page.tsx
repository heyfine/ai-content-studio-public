import { TaskRoutesClient } from "@/components/settings/task-routes-client";

export default function TaskRoutesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">任务路由</h1>
        <p className="text-sm text-muted-foreground">为每种 AI 任务指定使用的模型。</p>
      </div>
      <TaskRoutesClient />
    </div>
  );
}
