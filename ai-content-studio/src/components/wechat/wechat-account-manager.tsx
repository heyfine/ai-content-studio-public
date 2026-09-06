"use client";

import { Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface WechatAccountOption {
  id: string;
  name: string;
  appId: string;
  enabled: boolean;
}

/**
 * 微信公众号账号管理（自加载配置）。个人未认证订阅号仅开放草稿箱接口：
 * 文章通过 API 进入草稿箱后，需到公众号后台手动点「发表」。
 */
export function WechatAccountManager() {
  const [configs, setConfigs] = useState<WechatAccountOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/wechat/configs");
      if (!res.ok) return;
      setConfigs((await res.json()) as WechatAccountOption[]);
    } catch {
      // 加载失败保持原状
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function removeAccount(account: WechatAccountOption) {
    if (!confirm(`确认删除公众号「${account.name}」？该操作不可撤销。`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/wechat/configs/${account.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "删除失败");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-3" data-testid="wechat-account-manager">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">微信公众号账号</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="wechat-new-account">
          <PlusIcon className="size-4" /> 添加公众号
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有公众号账号，点击「添加公众号」绑定第一个公众号（个人未认证订阅号支持自动进草稿箱）。
        </p>
      ) : (
        <div className="space-y-2">
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
              data-testid="wechat-account-row"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">AppID：{c.appId}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`删除公众号 ${c.name}`}
                onClick={() => void removeAccount(c)}
                data-testid={`wechat-delete-${c.id}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AccountFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          setDialogOpen(false);
          await refresh();
        }}
      />
    </div>
  );
}

function AccountFormDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", appId: "", appSecret: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setFormError(null);
    if (!form.name.trim()) return setFormError("请填写公众号名称（备注）");
    if (!/^wx[0-9a-f]{16}$/i.test(form.appId.trim()))
      return setFormError("AppID 格式不正确（应为 wx 开头的 18 位字符串）");
    if (!form.appSecret.trim()) return setFormError("请填写 AppSecret");
    setSubmitting(true);
    try {
      const res = await fetch("/api/wechat/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), appId: form.appId.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "保存失败");
      setForm({ name: "", appId: "", appSecret: "" });
      await onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting && !o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加微信公众号</DialogTitle>
          <DialogDescription>
            绑定后可把文章一键送进公众号草稿箱；正式发表需到公众号后台手动操作。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">配置说明</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                AppID / AppSecret：「公众号后台 → 设置与开发 →
                基本配置」获取（开发者密钥可能已迁移至微信开发者平台）。
              </li>
              <li>
                必须把本机/服务器的出口 IP 加入「IP 白名单」，否则调用会报 40164（IP 不在白名单）。
              </li>
              <li>AppSecret 仅加密存储在服务端，不会返回给浏览器。</li>
            </ul>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="wechat-name">公众号名称（备注）</Label>
            <Input
              id="wechat-name"
              placeholder="如：我的订阅号"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wechat-appid">AppID</Label>
            <Input
              id="wechat-appid"
              placeholder="wx 开头的 18 位字符串"
              value={form.appId}
              onChange={(e) => setField("appId", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wechat-secret">AppSecret</Label>
            <Input
              id="wechat-secret"
              type="password"
              placeholder="公众号后台基本配置中获取"
              value={form.appSecret}
              onChange={(e) => setField("appSecret", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost" disabled={submitting}>
                取消
              </Button>
            }
          />
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
