"use client";

import { useState } from "react";
import { AlertTriangle, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { WpPost } from "@/lib/services/wordpress-service";

interface ConflictResolutionDialogProps {
  open: boolean;
  onClose: () => void;
  onResolve: (strategy: "local" | "remote") => Promise<void>;
  articleTitle: string;
  wpPostId: number;
  localContent: string;
  remoteContent: string;
}

export function ConflictResolutionDialog({
  open,
  onClose,
  onResolve,
  articleTitle,
  wpPostId,
  localContent,
  remoteContent,
}: ConflictResolutionDialogProps) {
  const [strategy, setStrategy] = useState<"local" | "remote">("local");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    try {
      await onResolve(strategy);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解决冲突失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <DialogTitle>检测到文章冲突</DialogTitle>
          </div>
          <DialogDescription>
            文章「{articleTitle}」（WordPress ID: {wpPostId}）在本地和博客都有修改，请选择保留哪一方的版本。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 选择策略 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">选择保留版本</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setStrategy("local")}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  strategy === "local"
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/50"
                }`}
              >
                <FileText className="size-6 text-primary" />
                <span className="font-medium">保留本地版本</span>
                <span className="text-xs text-muted-foreground">
                  将本地修改同步到博客
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStrategy("remote")}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  strategy === "remote"
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/50"
                }`}
              >
                <ExternalLink className="size-6 text-primary" />
                <span className="font-medium">保留博客版本</span>
                <span className="text-xs text-muted-foreground">
                从博客拉取最新修改
                </span>
              </button>
            </div>
          </div>

          {/* 内容对比 */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">内容对比</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">本地版本</span>
                  <span className="text-xs text-muted-foreground">
                    最后更新: {new Date().toLocaleString()}
                  </span>
                </div>
                <Textarea
                  value={localContent}
                  readOnly
                  rows={8}
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">博客版本</span>
                  <a
                    href={`https://your-blog.com/wp-admin/post.php?post=${wpPostId}&action=edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    在博客编辑
                  </a>
                </div>
                <Textarea
                  value={remoteContent}
                  readOnly
                  rows={8}
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "处理中…" : "确认解决"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}