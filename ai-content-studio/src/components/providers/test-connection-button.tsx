"use client";

import { useState } from "react";
import { Zap as ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TestResult {
  success: boolean;
  latencyMs?: number;
  models?: string[];
  error?: string;
}

export interface TestConnectionButtonProps {
  providerId: string;
  onResult?: (result: TestResult) => void;
}

export function TestConnectionButton({ providerId, onResult }: TestConnectionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function onClick() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: providerId }),
      });
      const data = (await res.json()) as TestResult;
      setResult(data);
      onResult?.(data);
    } catch (e) {
      const err: TestResult = { success: false, error: e instanceof Error ? e.message : String(e) };
      setResult(err);
      onResult?.(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
        <ZapIcon className="size-3.5" />
        {loading ? "测试中…" : "测试连接"}
      </Button>
      {result && (
        <span className={result.success ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
          {result.success
            ? `连接成功 ${result.latencyMs}ms（${result.models?.length ?? 0} 模型）`
            : `失败：${result.error}`}
        </span>
      )}
    </div>
  );
}
