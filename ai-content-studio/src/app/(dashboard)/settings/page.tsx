import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground">系统设置入口。</p>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>账号设置</CardTitle>
          <CardDescription>修改显示用户名与登录密码。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/settings/profile" />}>前往账号设置</Button>
        </CardContent>
      </Card>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>对象存储</CardTitle>
          <CardDescription>接入 S3 兼容对象存储，图片直传云桶公网直出。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/settings/storage" />}>前往配置</Button>
        </CardContent>
      </Card>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>备份与还原</CardTitle>
          <CardDescription>按域导出数据、还原备份、自动定时推送到 WebDAV。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/settings/backup" />}>前往备份</Button>
        </CardContent>
      </Card>
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
