"use client";

import { useState } from "react";
import { Pencil as PencilIcon, Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
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

export interface WpSiteOption {
  id: string;
  name: string;
  siteUrl: string;
  username: string;
  enabled: boolean;
}

interface Props {
  configs: WpSiteOption[];
  onChange: () => void;
}

export function WordPressSiteManager({ configs, onChange }: Props) {
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; site: WpSiteOption } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleEnabled(site: WpSiteOption) {
    setError(null);
    try {
      const res = await fetch(`/api/wordpress/configs/${site.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !site.enabled }),
      });
      if (!res.ok) throw new Error("更新失败");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeSite(site: WpSiteOption) {
    if (!confirm(`确认删除站点「${site.name}」？该操作不可撤销。`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/wordpress/configs/${site.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-3" data-testid="wp-site-manager">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">WordPress 站点管理</h3>
        <Button size="sm" onClick={() => setDialog({ mode: "create" })} data-testid="wp-new-site">
          <PlusIcon className="size-4" /> 新建站点
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有 WordPress 站点，点击「新建站点」添加第一个博客。
        </p>
      ) : (
        <div className="space-y-2">
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
              data-testid="wp-site-row"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.siteUrl} · {c.username}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  role="switch"
                  aria-checked={c.enabled}
                  aria-label={`启用站点 ${c.name}`}
                  data-testid={`wp-toggle-${c.id}`}
                  onClick={() => void toggleEnabled(c)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    c.enabled ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`inline-block size-4 transform rounded-full bg-background transition-transform ${
                      c.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`编辑站点 ${c.name}`}
                  onClick={() => setDialog({ mode: "edit", site: c })}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除站点 ${c.name}`}
                  onClick={() => void removeSite(c)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <SiteFormDialog
          mode={dialog.mode}
          site={dialog.mode === "edit" ? dialog.site : undefined}
          submitting={submitting}
          onSubmit={async (payload) => {
            setSubmitting(true);
            setError(null);
            try {
              const isEdit = dialog.mode === "edit";
              const res = await fetch(
                isEdit
                  ? `/api/wordpress/configs/${dialog.mode === "edit" ? dialog.site.id : ""}`
                  : "/api/wordpress/configs",
                {
                  method: isEdit ? "PUT" : "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                },
              );
              if (!res.ok) throw new Error("保存失败");
              setDialog(null);
              onChange();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setSubmitting(false);
            }
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

interface SiteFormValues {
  name: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  enabled: boolean;
}

function SiteFormDialog({
  mode,
  site,
  submitting,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  site?: WpSiteOption;
  submitting: boolean;
  onSubmit: (v: SiteFormValues) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<SiteFormValues>({
    name: site?.name ?? "",
    siteUrl: site?.siteUrl ?? "",
    username: site?.username ?? "",
    appPassword: "",
    enabled: site?.enabled ?? true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  function setField<K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    setFormError(null);
    if (!form.name.trim()) return setFormError("请填写站点名称（备注）");
    if (!/^https?:\/\/.+/i.test(form.siteUrl.trim()))
      return setFormError("站点 URL 需以 http(s):// 开头");
    if (!form.username.trim()) return setFormError("请填写 WordPress 用户名");
    if (mode === "create" && !form.appPassword) return setFormError("请填写 WordPress 应用密码");
    onSubmit(form);
  }

  const canSubmit =
    form.name.trim() &&
    /^https?:\/\/.+/i.test(form.siteUrl.trim()) &&
    form.username.trim() &&
    (mode === "edit" || Boolean(form.appPassword));

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新建 WordPress 站点" : "编辑站点"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "添加一个新的博客站点，之后可在 AI Studio 一键发送文章到这里。"
              : "修改站点配置；应用密码留空表示保持不变。"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">配置说明</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>站点名称：自定义备注，仅用于自己管理（如「技术博客」「生活博客」）。</li>
              <li>站点 URL：WordPress 地址，如 https://example.com（不要带末尾斜杠）。</li>
              <li>
                应用密码：WordPress 后台 → 用户 → 应用程序密码 → 新增（需已登录），用于 REST API
                鉴权，与登录密码不同。
              </li>
            </ul>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="site-name">站点名称（备注）</Label>
            <Input
              id="site-name"
              placeholder="如：技术博客"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-url">站点 URL</Label>
            <Input
              id="site-url"
              placeholder="https://example.com"
              value={form.siteUrl}
              onChange={(e) => setField("siteUrl", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-username">用户名</Label>
            <Input
              id="site-username"
              placeholder="WordPress 登录用户名"
              value={form.username}
              onChange={(e) => setField("username", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-app-password">应用密码</Label>
            <Input
              id="site-app-password"
              type="password"
              placeholder={mode === "edit" ? "留空表示保持不变" : "WordPress 应用密码"}
              value={form.appPassword}
              onChange={(e) => setField("appPassword", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="site-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setField("enabled", e.target.checked)}
            />
            <Label htmlFor="site-enabled">启用（发布时可选到此站点）</Label>
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
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
