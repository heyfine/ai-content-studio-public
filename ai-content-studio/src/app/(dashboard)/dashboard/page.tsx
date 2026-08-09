import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { title: "文章数量", value: "--" },
  { title: "AI 调用", value: "--" },
  { title: "Token 用量", value: "--" },
  { title: "SEO 平均分", value: "--" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground">AI Content Studio Phase 1 基线已就绪。</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardDescription>{s.title}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">统计将在 Phase 2 接入数据库后呈现真实数据。</p>
    </div>
  );
}
