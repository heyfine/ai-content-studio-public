"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil as PencilIcon, Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderTypeBadge } from "./provider-type-badge";
import { ProviderFormDialog } from "./provider-form-dialog";
import { TestConnectionButton } from "./test-connection-button";
import { ProviderToggle } from "./provider-toggle";

export interface ProviderRow {
  id: string;
  name: string;
  type: "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";
  baseUrl: string | null;
  apiKey: string;
  enabled: boolean;
  models: { id: string; name: string; displayName: string }[];
}

export function ProvidersTable() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/providers");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as ProviderRow[]);
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
    if (!confirm("确认删除该供应商？其下模型将一并删除。")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    void refresh();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-destructive">
        加载失败：{error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI 供应商</h2>
        <ProviderFormDialog
          trigger={
            <Button size="sm" render={<span />}>
              <PlusIcon className="size-4" /> 添加供应商
            </Button>
          }
          onSaved={refresh}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无供应商，点击右上角添加。</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-80">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <ProviderTypeBadge type={r.type} />
                  </TableCell>
                  <TableCell>
                    {r.models.length === 0 ? (
                      <span className="text-xs text-muted-foreground">暂无模型</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.models.map((m) => (
                          <li key={m.id} className="text-sm">
                            <span className="font-medium">{m.name}</span>
                            {m.displayName && m.displayName !== m.name && (
                              <span className="text-muted-foreground">（{m.displayName}）</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProviderToggle
                      id={r.id}
                      enabled={r.enabled}
                      onToggled={() => void refresh()}
                    />
                  </TableCell>
                  <TableCell className="space-x-2">
                    <TestConnectionButton providerId={r.id} />
                    <ProviderFormDialog
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="编辑" render={<span />}>
                          <PencilIcon className="size-4" />
                        </Button>
                      }
                      initialValues={{
                        id: r.id,
                        name: r.name,
                        type: r.type,
                        baseUrl: r.baseUrl ?? "",
                        enabled: r.enabled,
                        models: r.models.map((m) => ({ name: m.name, displayName: m.displayName })),
                      }}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
