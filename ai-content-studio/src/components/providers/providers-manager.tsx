"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus as PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requestJson } from "./client-api";
import { ProviderFormDialog } from "./provider-form-dialog";
import { ProviderTypeBadge } from "./provider-type-badge";
import {
  type ChannelTestProgress,
  type ModelTestState,
  type ProviderFormTarget,
  type ProviderRow,
} from "./provider-types";

export function ProvidersManager() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<ProviderFormTarget | null>(null);
  const [formApiKey, setFormApiKey] = useState<string | undefined>(undefined);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [channelTests, setChannelTests] = useState<Record<string, ChannelTestProgress>>({});
  const [rowTestErrors, setRowTestErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await requestJson<ProviderRow[]>("/api/providers"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setFormTarget(null);
    setFormApiKey(undefined);
    setFormOpen(true);
  }

  function openEdit(row: ProviderRow) {
    setFormTarget({
      id: row.id,
      name: row.name,
      type: row.type,
      baseUrl: row.baseUrl ?? "",
      enabled: row.enabled,
      models: row.models.map((m) => ({ name: m.name })),
    });
    setFormApiKey(undefined);
    setFormOpen(true);
  }

  /** 复制渠道：取回已存 Key 带入新建表单（取不到则留空手填） */
  async function openDuplicate(row: ProviderRow) {
    let apiKey: string | undefined;
    try {
      const res = await requestJson<{ apiKey: string }>(`/api/providers/${row.id}`);
      apiKey = res.apiKey;
    } catch {
      apiKey = undefined;
    }
    setFormTarget({
      name: `${row.name} 副本`,
      type: row.type,
      baseUrl: row.baseUrl ?? "",
      models: row.models.map((m) => ({ name: m.name })),
    });
    setFormApiKey(apiKey);
    setFormOpen(true);
  }

  async function toggleEnabled(row: ProviderRow) {
    await requestJson(`/api/providers/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    void refresh();
  }

  async function remove(row: ProviderRow) {
    if (!confirm(`确认删除供应商「${row.name}」？其下模型将一并删除。`)) return;
    await requestJson(`/api/providers/${row.id}`, { method: "DELETE" });
    void refresh();
  }

  /** 整渠道连通测试：3 个并发逐个测试全部模型，进度实时更新 */
  async function testChannel(row: ProviderRow) {
    const models = row.models.map((m) => m.name);
    if (models.length === 0) {
      setRowTestErrors((prev) => ({ ...prev, [row.id]: "✗ 未配置任何模型" }));
      return;
    }
    setRowTestErrors((prev) => ({ ...prev, [row.id]: "" }));
    setTestingId(row.id);
    setChannelTests((prev) => ({
      ...prev,
      [row.id]: { done: 0, total: models.length, results: {} },
    }));

    const results: Record<string, ModelTestState> = {};
    let done = 0;
    const runOne = async (model: string) => {
      try {
        const res = await requestJson<{ ok: boolean; latencyMs: number; error?: string }>(
          "/api/providers/test-model",
          { method: "POST", body: JSON.stringify({ providerId: row.id, model }) },
        );
        results[model] = res.ok
          ? { status: "ok", latencyMs: res.latencyMs }
          : { status: "fail", error: res.error ?? "测试失败" };
      } catch (e) {
        results[model] = { status: "fail", error: e instanceof Error ? e.message : String(e) };
      }
      done++;
      setChannelTests((prev) =>
        prev[row.id]
          ? { ...prev, [row.id]: { done, total: models.length, results: { ...results } } }
          : prev,
      );
    };

    const queue = [...models];
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length > 0) {
          const m = queue.shift();
          if (m) await runOne(m);
        }
      }),
    );
    setTestingId(null);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        加载失败：{error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI 供应商</h2>
        <Button size="sm" onClick={openCreate} data-testid="create-provider">
          <PlusIcon className="size-4" /> 新建供应商
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有供应商，点击右上角「新建供应商」添加。
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-72">连通测试</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const progress = channelTests[row.id];
                const okCount = progress
                  ? Object.values(progress.results).filter((r) => r.status === "ok").length
                  : 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <ProviderTypeBadge type={row.type} />
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate font-mono text-xs"
                      title={row.baseUrl ?? ""}
                    >
                      {row.baseUrl || <span className="text-muted-foreground">官方默认</span>}
                    </TableCell>
                    <TableCell
                      className="max-w-[240px] truncate font-mono text-xs"
                      title={row.models.map((m) => m.name).join(", ")}
                    >
                      {row.models.length === 0 ? (
                        <span className="text-muted-foreground">暂无模型</span>
                      ) : (
                        row.models.map((m) => m.name).join(", ")
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                          row.enabled
                            ? "bg-green-100 text-green-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.enabled ? "启用" : "停用"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                        disabled={testingId === row.id}
                        onClick={() => void testChannel(row)}
                        data-testid={`test-channel-${row.id}`}
                      >
                        {testingId === row.id
                          ? progress && progress.total > 1
                            ? `测试中 ${progress.done}/${progress.total}`
                            : "测试中"
                          : row.models.length > 1
                            ? `连通测试 (${row.models.length} 个模型)`
                            : "连通测试"}
                      </button>
                      {rowTestErrors[row.id] && (
                        <div className="mt-1 text-xs text-destructive">{rowTestErrors[row.id]}</div>
                      )}
                      {progress && (
                        <div
                          className="mt-1 max-h-40 overflow-y-auto rounded-lg border bg-muted/40 px-2 py-1"
                          data-testid={`channel-tests-${row.id}`}
                        >
                          <div className="pb-1 text-[11px] text-muted-foreground">
                            可用 {okCount} / {progress.total}
                          </div>
                          {row.models.map((m) => {
                            const r = progress.results[m.name];
                            return (
                              <div
                                key={m.id}
                                className="flex items-center gap-1.5 text-[11px] leading-5"
                              >
                                <span className="font-mono max-w-[120px] truncate" title={m.name}>
                                  {m.name}
                                </span>
                                {!r ? (
                                  <span className="text-muted-foreground">…</span>
                                ) : r.status === "ok" ? (
                                  <span className="whitespace-nowrap text-green-600">
                                    ✓ {r.latencyMs}ms
                                  </span>
                                ) : r.status === "fail" ? (
                                  <span
                                    className="max-w-[140px] truncate text-red-500"
                                    title={r.error}
                                  >
                                    ✗ {r.error}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => openEdit(row)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="text-indigo-500 hover:underline"
                          title="复制该供应商的全部配置为新建"
                          onClick={() => void openDuplicate(row)}
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:underline"
                          onClick={() => void toggleEnabled(row)}
                        >
                          {row.enabled ? "停用" : "启用"}
                        </button>
                        <button
                          type="button"
                          className="text-red-500 hover:underline"
                          onClick={() => void remove(row)}
                        >
                          删除
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <ProviderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        target={formTarget}
        initialApiKey={formApiKey}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
