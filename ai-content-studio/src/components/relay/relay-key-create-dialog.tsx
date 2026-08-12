"use client";

import { useState } from "react";
import { Check as CheckIcon, Copy as CopyIcon, Plus as PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface RelayKeyCreateDialogProps {
  trigger: React.ReactNode;
  onSaved?: () => void;
}

export function RelayKeyCreateDialog({ trigger, onSaved }: RelayKeyCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setName("");
    setSecret(null);
    setError(null);
    setCopied(false);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/relay-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "创建失败");
        return;
      }
      const data = (await res.json()) as { secret: string };
      setSecret(data.secret);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={trigger as never} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建中转密钥</DialogTitle>
          <DialogDescription>创建后明文只显示一次，请妥善保存。</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              密钥已创建，请立即复制保存，关闭后将无法再次完整查看（仍可点眼睛查看）。
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-sm"
                data-testid="created-secret"
              >
                {secret}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void copySecret()}
                aria-label="复制密钥"
              >
                {copied ? (
                  <CheckIcon className="size-4 text-emerald-600" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                完成
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="relay-key-name">名称</Label>
              <Input
                id="relay-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：博客发布器"
                data-testid="relay-key-name-input"
                autoFocus
              />
            </div>
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="ghost">
                    取消
                  </Button>
                }
              />
              <Button type="submit" disabled={submitting || !name} data-testid="relay-key-submit">
                {submitting ? "创建中…" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
