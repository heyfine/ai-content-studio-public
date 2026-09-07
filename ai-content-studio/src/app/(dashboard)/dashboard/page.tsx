import {
  Coins as CoinsIcon,
  FileText as FileTextIcon,
  Gauge as GaugeIcon,
  type LucideIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StatItem {
  title: string;
  value: string;
  icon: LucideIcon;
  /** 图标底色与文字色（品牌多彩点缀，克制使用） */
  iconClass: string;
}

const stats: StatItem[] = [
  {
    title: "文章数量",
    value: "--",
    icon: FileTextIcon,
    iconClass: "bg-primary/10 text-primary",
  },
  {
    title: "AI 调用",
    value: "--",
    icon: SparklesIcon,
    iconClass: "bg-chart-5/10 text-chart-5",
  },
  {
    title: "Token 用量",
    value: "--",
    icon: CoinsIcon,
    iconClass: "bg-chart-3/10 text-chart-3",
  },
  {
    title: "SEO 平均分",
    value: "--",
    icon: GaugeIcon,
    iconClass: "bg-chart-4/10 text-chart-4",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="text-sm text-muted-foreground">AI Content Studio Phase 1 基线已就绪。</p>
        </div>
        <span className="ml-auto rounded-full bg-gradient-to-r from-primary to-chart-5 px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm shadow-primary/20">
          v1 基线
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.title}
              className="transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>{s.title}</CardDescription>
                <span
                  aria-hidden
                  className={`flex size-9 items-center justify-center rounded-lg ${s.iconClass}`}
                >
                  <Icon className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-3xl">{s.value}</CardTitle>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">统计将在 Phase 2 接入数据库后呈现真实数据。</p>
    </div>
  );
}
