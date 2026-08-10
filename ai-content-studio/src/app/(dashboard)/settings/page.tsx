import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground">系统设置入口。</p>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>任务路由</CardTitle>
          <CardDescription>为每种 AI 任务指定使用的模型。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/settings/task-routes" />}>前往配置</Button>
        </CardContent>
      </Card>
    </div>
  );
}
