"use client";

import {
  CloudDownload as CloudDownloadIcon,
  Download as DownloadIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  Play as PlayIcon,
  PlugZap as PlugZapIcon,
  RotateCcw as RotateCcwIcon,
  Save as SaveIcon,
  Trash as TrashIcon,
  Upload as UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/datetime";

interface BackupDomain {
  key: string;
  label: string;
  description: string;
  models: string[];
}

interface WebdavTarget {
  id: string;
  name: string;
  url: string;
  username: string;
  hasPassword: boolean;
  enabled: boolean;
  intervalHours: number;
  keep: number;
}

interface AutoStatus {
  nextBackupAt: string | null;
  lastBackupAt: string | null;
  lastBackupStatus: "ok" | "error" | null;
  lastBackupMessage: string | null;
}

interface WebdavFile {
  filename: string;
  size: number;
  lastModified: string | null;
}

/** API 返回的备份文件结构（即 /api/backup/restore 的 body.backup） */
interface BackupFilePayload {
  format: string;
  formatVersion: number;
  exportedAt: string;
  full: boolean;
  domains: string[];
  data: Record<string, unknown[]>;
}

interface TargetDraft extends WebdavTarget {
  password: string;
}

const EMPTY_TARGET: TargetDraft = {
  id: "",
  name: "",
  url: "",
  username: "",
  hasPassword: false,
  password: "",
  enabled: true,
  intervalHours: 12,
  keep: 7,
};

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function BackupManager() {
  const [domains, setDomains] = useState<BackupDomain[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const restoreModeRef = useRef<"merge" | "overwrite">("merge");

  const [targets, setTargets] = useState<TargetDraft[]>([]);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [status, setStatus] = useState<AutoStatus | null>(null);
  const [files, setFiles] = useState<WebdavFile[]>([]);
  const [filesTargetId, setFilesTargetId] = useState("");
  /** WebDAV 密码明文显示状态：targetId → 已取回明文（点眼睛取回后与输入框联动切换显示） */
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [shownTargets, setShownTargets] = useState<Record<string, boolean>>({});
  /** 旧版备份跨环境还原时手动提供的来源 ENCRYPTION_KEY */
  const [sourceKeyInput, setSourceKeyInput] = useState("");

  const loadAuto = useCallback(async () => {
    const res = await fetch("/api/backup/auto");
    if (!res.ok) return;
    const body = (await res.json()) as {
      settings: { enabled: boolean; webdavTargets: WebdavTarget[] };
      status: AutoStatus;
    };
    setAutoEnabled(body.settings.enabled);
    setTargets(
      body.settings.webdavTargets.map((t) => ({
        ...t,
        password: "",
      })),
    );
    setStatus(body.status);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/backup?domains=1");
      if (res.ok) {
        const body = (await res.json()) as { domains: BackupDomain[] };
        setDomains(body.domains);
        setChecked(new Set(body.domains.map((d) => d.key)));
      }
      await loadAuto();
    })();
  }, [loadAuto]);

  function toggleDomain(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function flash(ok: string) {
    setMessage(ok);
    setError(null);
  }

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
    setMessage(null);
  }

  async function handleBackup() {
    if (checked.size === 0) {
      fail(new Error("请至少勾选一个备份范围"));
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: [...checked] }),
      });
      const body = (await res.json()) as {
        backup?: BackupFilePayload;
        totalRows?: number;
        error?: string;
      };
      if (!res.ok || !body.backup) throw new Error(body.error ?? "备份失败");
      // 与 WebDAV 自动备份一致：紧凑 JSON（数据相同、体积最小、还原等价）
      const blob = new Blob([JSON.stringify(body.backup)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acs-backup-${body.backup.exportedAt.replace(/[:.]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash(`备份成功，共 ${body.totalRows} 行，已下载`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreFile(file: File) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const text = await file.text();
      const backup: unknown = JSON.parse(text);
      const mode = restoreModeRef.current;
      if (
        !window.confirm(
          `确认以「${mode === "merge" ? "合并覆盖" : "覆盖还原（先清空备份涉及的表）"}」模式还原？此操作直接影响数据库内容。`,
        )
      ) {
        return;
      }
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backup,
          mode,
          // 旧版本备份（文件内无来源密钥）跨环境还原时手动提供
          sourceEncryptionKey: sourceKeyInput.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        totalRows?: number;
        warnings?: string[];
        reEncrypted?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "还原失败");
      if (body.reEncrypted) {
        flash(
          `还原成功，共 ${body.totalRows} 行。✓ 已用备份密钥解密并以当前密钥重新加密 ${body.reEncrypted} 个密文字段，S3/AI/公众号等密码已完整恢复`,
        );
      } else if (body.warnings && body.warnings.length > 0) {
        flash(`还原成功，共 ${body.totalRows} 行。⚠ ${body.warnings.join(" ")}`);
      } else {
        flash(`还原成功，共 ${body.totalRows} 行`);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function updateTarget<K extends keyof TargetDraft>(idx: number, key: K, value: TargetDraft[K]) {
    setTargets((prev) => prev.map((t, i) => (i === idx ? { ...t, [key]: value } : t)));
  }

  /** 眼睛图标：首次点击取回已存 WebDAV 密码并回填输入框，之后切换明文/掩码显示 */
  async function toggleRevealPassword(t: TargetDraft, idx: number) {
    const tid = t.id;
    if (!tid) return;
    setShownTargets((prev) => ({ ...prev, [tid]: !prev[tid] }));
    if (revealedPasswords[tid] !== undefined) return;
    setBusy(true);
    try {
      const res = await fetch("/api/backup/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "reveal", targetId: tid }),
      });
      const data = (await res.json().catch(() => null)) as {
        password?: string;
        error?: string;
      } | null;
      if (!res.ok || typeof data?.password !== "string") {
        setError(data?.error ?? "查看密码失败");
        return;
      }
      setRevealedPasswords((prev) => ({ ...prev, [tid]: data.password! }));
      updateTarget(idx, "password", data.password!);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAuto() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/backup/auto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoEnabled,
          targets: targets.map((t) => ({
            id: t.id || undefined,
            name: t.name,
            url: t.url,
            username: t.username,
            password: t.password || undefined,
            enabled: t.enabled,
            intervalHours: t.intervalHours,
            keep: t.keep,
          })),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "保存失败");
      flash("自动备份设置已保存");
      await loadAuto();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoOp(op: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/backup/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ...extra }),
      });
      const body = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "操作失败");
      if (op === "run") {
        flash(`立即备份完成：${String(body.filename ?? "")}（${String(body.totalRows ?? 0)} 行）`);
        await loadAuto();
      } else if (op === "test") {
        flash(body.ok ? "连接成功" : `连接失败：${String(body.message ?? "")}`);
        if (!body.ok) setError(String(body.message ?? "连接失败"));
      } else if (op === "files") {
        setFiles((body.files as WebdavFile[]) ?? []);
        setFilesTargetId(String(extra.targetId ?? ""));
      } else if (op === "restore") {
        const warnings = Array.isArray(body.warnings) ? (body.warnings as string[]) : [];
        flash(
          warnings.length > 0
            ? `从 WebDAV 还原成功，共 ${String(body.totalRows ?? 0)} 行。⚠ ${warnings.join(" ")}`
            : `从 WebDAV 还原成功，共 ${String(body.totalRows ?? 0)} 行`,
        );
        await loadAuto();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>手动备份</CardTitle>
          <CardDescription>勾选要导出的数据范围，生成 JSON 备份文件下载到本地。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {domains.map((d) => (
              <label
                key={d.key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={checked.has(d.key)}
                  onChange={() => toggleDomain(d.key)}
                  className="mt-1 size-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-sm font-medium">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{d.description}</span>
                </span>
              </label>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => void handleBackup()} disabled={busy}>
            <DownloadIcon className="size-4" />
            {busy ? "备份中…" : "备份并下载"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>还原</CardTitle>
          <CardDescription>
            上传本系统的备份文件还原。合并覆盖 = 同名数据覆盖、其余保留；覆盖还原 =
            先清空备份涉及的表再写入（结果 = 备份快照）。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <select
            aria-label="还原模式"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            defaultValue="merge"
            onChange={(e) => {
              restoreModeRef.current = e.target.value as "merge" | "overwrite";
            }}
          >
            <option value="merge">合并覆盖</option>
            <option value="overwrite">覆盖还原</option>
          </select>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleRestoreFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => restoreInputRef.current?.click()}
          >
            <UploadIcon className="size-4" />
            选择备份文件还原
          </Button>
          <div className="w-full space-y-1">
            <Label htmlFor="restore-source-key">
              备份来源 ENCRYPTION_KEY（仅旧版备份跨环境还原时填写；新版备份已自带，无需填写）
            </Label>
            <Input
              id="restore-source-key"
              type="password"
              autoComplete="off"
              placeholder="旧备份在另一台环境加密时的 ENCRYPTION_KEY（32 字节 base64）"
              value={sourceKeyInput}
              onChange={(e) => setSourceKeyInput(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>自动备份（定时推送到 WebDAV）</CardTitle>
          <CardDescription>
            服务器内置调度器每 5
            分钟检查一次；每个目标独立间隔与保留份数，超出份数的旧备份自动清理。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              上次备份：
              {status.lastBackupAt
                ? `${formatDateTime(status.lastBackupAt)}（${status.lastBackupStatus === "ok" ? "成功" : "失败"}：${status.lastBackupMessage ?? ""}）`
                : "尚未执行"}
              {status.nextBackupAt && ` · 下次：${formatDateTime(status.nextBackupAt)}`}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              id="auto-enabled"
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            <Label htmlFor="auto-enabled">启用自动备份</Label>
          </div>

          {targets.map((t, idx) => (
            <div key={t.id || `new-${idx}`} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>名称</Label>
                  <Input
                    value={t.name}
                    onChange={(e) => updateTarget(idx, "name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>WebDAV 地址（目录）</Label>
                  <Input
                    value={t.url}
                    placeholder="https://dav.example.com/acs-backup/"
                    onChange={(e) => updateTarget(idx, "url", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>用户名</Label>
                  <Input
                    value={t.username}
                    onChange={(e) => updateTarget(idx, "username", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>密码{t.hasPassword ? "（留空沿用已存，点眼睛查看）" : ""}</Label>
                  <div className="flex gap-2">
                    <Input
                      type={shownTargets[t.id] && t.password ? "text" : "password"}
                      value={t.password}
                      autoComplete="new-password"
                      placeholder={t.hasPassword && !t.password ? "已保存（点眼睛图标查看）" : ""}
                      onChange={(e) => updateTarget(idx, "password", e.target.value)}
                    />
                    {t.id && t.hasPassword && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0"
                        aria-label={shownTargets[t.id] ? "隐藏密码" : "显示密码"}
                        aria-pressed={!!shownTargets[t.id]}
                        data-testid={`webdav-reveal-${t.id}`}
                        onClick={() => void toggleRevealPassword(t, idx)}
                      >
                        {shownTargets[t.id] && t.password ? (
                          <EyeOffIcon className="size-4" />
                        ) : (
                          <EyeIcon className="size-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>间隔（小时，1~720）</Label>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={t.intervalHours}
                    onChange={(e) => updateTarget(idx, "intervalHours", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>保留份数</Label>
                  <Input
                    type="number"
                    min={1}
                    value={t.keep}
                    onChange={(e) => updateTarget(idx, "keep", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => updateTarget(idx, "enabled", e.target.checked)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  启用
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleAutoOp("test", { targetId: t.id })}
                >
                  <PlugZapIcon className="size-4" />
                  测试连接
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy || !t.id}
                  onClick={() => void handleAutoOp("files", { targetId: t.id })}
                >
                  <CloudDownloadIcon className="size-4" />
                  查看云端备份
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`删除目标 ${t.name}`}
                  onClick={() => setTargets((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <TrashIcon className="size-4 text-destructive" />
                </Button>
              </div>
              {filesTargetId === t.id && files.length > 0 && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    云端备份文件（最新在前）
                  </p>
                  {files.map((f) => (
                    <div key={f.filename} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono">{f.filename}</span>
                      <span className="text-muted-foreground">{fmtSize(f.size)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void handleAutoOp("restore", {
                            targetId: t.id,
                            filename: f.filename,
                            mode: "merge",
                          })
                        }
                      >
                        <RotateCcwIcon className="size-3.5" />
                        合并还原
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => setTargets((prev) => [...prev, { ...EMPTY_TARGET, id: "" }])}
          >
            添加 WebDAV 目标
          </Button>
        </CardContent>
        <CardFooter className="gap-3">
          <Button onClick={() => void handleSaveAuto()} disabled={busy}>
            <SaveIcon className="size-4" />
            {busy ? "保存中…" : "保存自动备份设置"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void handleAutoOp("run")}>
            <PlayIcon className="size-4" />
            立即备份一次
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
