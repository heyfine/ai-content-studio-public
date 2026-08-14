import { ArticlesTrashClient } from "@/components/articles/articles-trash-client";

export default function TrashPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">回收站</h1>
        <p className="text-sm text-muted-foreground">
          已删除的文章会先进入回收站，可恢复或彻底删除。
        </p>
      </div>
      <ArticlesTrashClient />
    </div>
  );
}
