import { ArticlesClient } from "@/components/articles/articles-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">文章管理</h1>
        <p className="text-sm text-muted-foreground">
          草稿与已发布文章，状态机：草稿 → 审阅 → 已发布 → 已归档。
        </p>
      </div>
      <ArticlesClient />
    </div>
  );
}
