"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface RelayKeyToggleProps {
  id: string;
  enabled: boolean;
  onToggled?: () => void;
}

export function RelayKeyToggle({ id, enabled, onToggled }: RelayKeyToggleProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/relay-keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "切换失败");
        return;
      }
      onToggled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "点击禁用" : "点击启用"}
        data-testid="relay-toggle"
        disabled={loading}
        onClick={() => void toggle()}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          enabled ? "bg-emerald-500" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
