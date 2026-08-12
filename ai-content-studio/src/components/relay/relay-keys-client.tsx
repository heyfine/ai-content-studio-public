"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RelayApiCard } from "./relay-api-card";
import { RelayKeyCell } from "./relay-key-cell";
import { RelayKeyToggle } from "./relay-key-toggle";
import { RelayKeyCreateDialog } from "./relay-key-create-dialog";

interface RelayKeyRow {
  id: string;
  name: string;
  keyMasked: string;
  keyPrefix: string;
  enabled: boolean;
  createdAt: string;
}

export function RelayKeysClient() {
  const [rows, setRows] = useState<RelayKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relay-keys");
      if (!res.ok) throw new Error("加载失败");
      setRows((await res.json()) as RelayKeyRow[]);
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
    if (!confirm("确认删除该中转密钥？已用此 Key 的软件将无法再调用。")) return;
    await fetch(`/api/relay-keys/${id}`, { method: "DELETE" });
    void refresh();
  }

  return (
    <div className="space-y-6">
      <RelayApiCard />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">中转密钥</h2>
        <RelayKeyCreateDialog
          trigger={
            <Button size="sm" render={<span />}>
              <PlusIcon className="size-4" /> 新建 Key
            </Button>
          }
          onSaved={refresh}
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : error ? (
        <p role="alert" className="text-destructive">
          加载失败：{error}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无中转密钥，点击右上角新建。</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <RelayKeyCell id={r.id} keyMasked={r.keyMasked} />
                  </TableCell>
                  <TableCell>
                    <RelayKeyToggle
                      id={r.id}
                      enabled={r.enabled}
                      onToggled={() => void refresh()}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
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
