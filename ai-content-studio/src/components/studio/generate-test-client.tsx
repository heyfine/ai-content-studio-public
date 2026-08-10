"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { taskRouteDefinitions } from "@/config/task-routes";

interface GenerateResult {
  content: string;
  modelId: string;
  generationId: string;
  inputTokens?: number;
  outputTokens?: number;
}

export function GenerateTestClient() {
  const [task, setTask] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<GenerateResult | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setOutput("");
    setTokens(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, input }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "生成失败");
      }
      setOutput(data.content);
      setTokens(data as GenerateResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI 生成测试</CardTitle>
          <CardDescription>选择任务类型并输入内容，快速验证 AI 生成链路是否畅通。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="studio-task-select" className="text-sm font-medium">
              任务类型
            </label>
            <Select value={task} onValueChange={(v) => v && setTask(v)}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="选择任务" />
              </SelectTrigger>
              <SelectContent>
                {taskRouteDefinitions.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="studio-input" className="text-sm font-medium">
              输入内容
            </label>
            <textarea
              id="studio-input"
              className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="输入需要 AI 处理的文本…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} disabled={loading || !task || !input}>
            {loading ? "生成中…" : "生成"}
          </Button>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      {output && (
        <Card>
          <CardHeader>
            <CardTitle>生成结果</CardTitle>
            {tokens && (
              <CardDescription>
                模型 {tokens.modelId} · 输入 {tokens.inputTokens ?? "?"} / 输出{" "}
                {tokens.outputTokens ?? "?"} tokens
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-7">{output}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
