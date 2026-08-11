"use client";

import { useState } from "react";
import { Power as PowerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProviderToggleProps {
  id: string;
  enabled: boolean;
  onToggled?: () => void;
}

export function ProviderToggle({ id, enabled, onToggled }: ProviderToggleProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/providers/${id}`, {
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
      <Button
        type="button"
        variant={enabled ? "secondary" : "outline"}
        size="sm"
        onClick={() => void toggle()}
        disabled={loading}
        aria-pressed={enabled}
        aria-label={enabled ? "点击禁用" : "点击启用"}
      >
        <PowerIcon className="size-3.5" />
        {loading ? "切换中…" : enabled ? "启用" : "禁用"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
