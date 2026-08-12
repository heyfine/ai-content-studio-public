import { SourcesClient } from "@/components/sources/sources-client";

export default function SourcesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">来源库</h1>
        <p className="text-sm text-muted-foreground">
          外部来源采集（URL → 抓取 → 正文解析 → 去重 → 版本）。Phase 1 AI Research & Rewrite。
        </p>
      </div>
      <SourcesClient />
    </div>
  );
}
