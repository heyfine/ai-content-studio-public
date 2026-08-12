"use client";

import { useEffect, useState } from "react";
import { Check as CheckIcon, Copy as CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RelayApiCard() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const baseUrl = origin ? `${origin}/v1` : "/v1";
  const modelsExample = `curl -H "Authorization: Bearer sk-relay-..." ${baseUrl}/models`;
  const chatExample =
    'curl -H "Authorization: Bearer sk-relay-..." -H "Content-Type: application/json" ' +
    `-d '{"model":"基元律动/deepseek-v4-flash-0731","messages":[{"role":"user","content":"你好"}]}' ${baseUrl}/chat/completions`;

  async function copyUrl() {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(baseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API 中转地址</CardTitle>
        <CardDescription>把下方地址与某个中转密钥填入其它软件即可调用。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <code
            className="flex-1 truncate rounded bg-muted px-3 py-2 text-sm"
            data-testid="relay-base-url"
          >
            {baseUrl}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void copyUrl()}
            aria-label="复制 API 地址"
          >
            {copied ? (
              <CheckIcon className="size-4 text-emerald-600" />
            ) : (
              <CopyIcon className="size-4" />
            )}
          </Button>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">用法示例：</p>
          <pre className="whitespace-pre-wrap font-mono">{modelsExample}</pre>
          <pre className="mt-1 whitespace-pre-wrap font-mono">{chatExample}</pre>
        </div>
      </CardContent>
    </Card>
  );
}
