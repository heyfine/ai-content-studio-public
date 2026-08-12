"use client";

import { useState } from "react";
import { Copy as CopyIcon, Eye as EyeIcon, EyeOff as EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RelayKeyCellProps {
  id: string;
  keyMasked: string;
}

export function RelayKeyCell({ id, keyMasked }: RelayKeyCellProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealedError, setRevealedError] = useState<string | null>(null);

  async function reveal() {
    if (revealed) {
      setRevealed(null);
      setRevealedError(null);
      return;
    }
    setLoading(true);
    setRevealedError(null);
    try {
      const res = await fetch(`/api/relay-keys/${id}/reveal`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; cause?: string };
        throw new Error(err.error ?? err.cause ?? "查看密钥失败");
      }
      const data = (await res.json()) as { key: string };
      setRevealed(data.key);
    } catch (e) {
      setRevealedError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    const value = revealed ?? keyMasked;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  }

  const display = revealed ?? keyMasked;

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1 w-full">
        <code className="max-w-[14rem] truncate font-mono text-sm" data-testid="relay-key-display">
          {display}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void reveal()}
          disabled={loading}
          aria-label={revealed ? "隐藏密钥" : "显示密钥"}
          aria-pressed={!!revealed}
          data-testid="relay-reveal"
        >
          {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyKey()}
          aria-label="复制密钥"
          data-testid="relay-copy"
        >
          <CopyIcon className="size-4" />
        </Button>
        {copied && (
          <span className="text-xs text-emerald-600" data-testid="relay-copied-tip">
            已复制
          </span>
        )}
      </span>
      {revealedError && (
        <span className="text-xs text-destructive" data-testid="relay-reveal-error">
          {revealedError}
        </span>
      )}
    </span>
  );
}
