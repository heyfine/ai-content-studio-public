"use client";

import { useEffect, useState } from "react";
import { ExternalLink as ExternalLinkIcon, Send as SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useStudioStore } from "@/stores/studio-store";
import { taskRouteDefinitions } from "@/config/task-routes";

interface BlogOption {
  id: string;
  name: string;
  siteUrl: string;
  enabled: boolean;
}

function taskLabel(task: string): string {
  return taskRouteDefinitions.find((t) => t.value === task)?.label ?? task;
}

export function BlogPublishDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { title, generations } = useStudioStore();
  const [configs, setConfigs] = useState<BlogOption[]>([]);
  const [configId, setConfigId] = useState("");
  const [genId, setGenId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; wpPostId: string; status: string } | null>(
    null,
  );

  const candidates = generations.filter((g) => g.content.trim().length > 0);
  const selectedGen = candidates.find((g) => g.id === genId) ?? null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/wordpress/configs");
        if (!res.ok) throw new Error("加载站点失败");
        const cfgs = ((await res.json()) as BlogOption[]).filter((c) => c.enabled);
        if (!cancelled) {
          setConfigs(cfgs);
          setConfigId((prev) => (cfgs.some((c) => c.id === prev) ? prev : (cfgs[0]?.id ?? "")));
        }
      } catch {
        if (!cancelled) setConfigs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open && candidates.length > 0 && !candidates.some((g) => g.id === genId)) {
      setGenId(candidates[candidates.length - 1].id);
    }
  }, [open, candidates, genId]);

  const canSend = !!configId && !!selectedGen && !sending;

  async function send() {
    if (!selectedGen) return;
    setError(null);
    setResult(null);
    setSending(true);
    try {
      const res = await fetch("/api/wordpress/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: selectedGen.content,
          configId,
          wpStatus: "publish",
        }),
      });
      const data = (await res.json()) as {
        link?: string;
        wpPostId?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "发送失败");
      setResult({
        link: data.link ?? "",
        wpPostId: String(data.wpPostId ?? ""),
        status: data.status ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>一键发送到博客</DialogTitle>
          <DialogDescription>
            把某一次生成的结果直接发布到你选定的 WordPress 博客。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {result ? (
            <div className="space-y-2 rounded-md border p-3" data-testid="blog-publish-result">
              <p className="text-sm">
                发送成功！WP 文章 ID：
                <span className="font-mono font-medium">#{result.wpPostId}</span>
                <span className="ml-2 text-muted-foreground">（{result.status}）</span>
              </p>
              <a
                href={result.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                data-testid="blog-publish-link"
              >
                <ExternalLinkIcon className="size-3" /> {result.link}
              </a>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="blog-publish-config">发送到哪个博客</Label>
                {configs.length === 0 ? (
                  <p className="text-sm text-amber-600" data-testid="blog-no-config">
                    暂无启用的 WordPress 站点，请先到发布板块「新建站点」或启用站点。
                  </p>
                ) : (
                  <select
                    id="blog-publish-config"
                    aria-label="发送到哪个博客"
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    value={configId}
                    onChange={(e) => setConfigId(e.target.value)}
                  >
                    {configs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}（{c.siteUrl}）
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="blog-publish-gen">选择生成结果</Label>
                {candidates.length === 0 ? (
                  <p className="text-sm text-amber-600" data-testid="blog-no-gen">
                    还没有生成结果，请先在右侧「AI 操作」生成内容。
                  </p>
                ) : (
                  <select
                    id="blog-publish-gen"
                    aria-label="选择生成结果"
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    value={genId ?? ""}
                    onChange={(e) => setGenId(e.target.value || null)}
                  >
                    {candidates.map((g) => (
                      <option key={g.id} value={g.id}>
                        第{g.index}次 · {taskLabel(g.task)} · {g.createdAt}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            关闭
          </Button>
          <Button onClick={() => void send()} disabled={!canSend} data-testid="blog-publish-send">
            <SendIcon className="size-4" /> {sending ? "发送中…" : "发送到博客"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
