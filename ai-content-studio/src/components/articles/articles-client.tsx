"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil as PencilIcon, Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArticleStatusBadge } from "./article-status-badge";
import { ArticleEditorDialog, type ArticleRow } from "./article-editor-dialog";

export function ArticlesClient() {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/articles");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as ArticleRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onDelete(id: string) {
    if (!confirm("确认删除该文章？")) return;
    await fetch(`/api/articles/${id}`, { method: "DELETE" });
    void refresh();
  }

  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">文章管理</h2>
        <ArticleEditorDialog
          trigger={
            <Button size="sm" render={<span />}>
              <PlusIcon className="size-4" /> 新建文章
            </Button>
          }
          onSaved={refresh}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无文章，点击右上角新建。</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">标题</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">更新时间</th>
                <th className="w-28 px-4 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{r.title}</td>
                  <td className="px-4 py-2">
                    <ArticleStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.updatedAt?.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <ArticleEditorDialog
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="编辑" render={<span />}>
                            <PencilIcon className="size-4" />
                          </Button>
                        }
                        initialValues={r}
                        onSaved={refresh}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="删除"
                        onClick={() => onDelete(r.id)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
