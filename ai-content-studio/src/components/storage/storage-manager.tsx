"use client";

import {
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  PlugZap as PlugZapIcon,
  Trash as TrashIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import {
  getPreset,
  S3_CLIENT_APP_OPTIONS,
  S3_PROVIDER_PRESETS,
} from "@/lib/services/storage-service";

interface StorageConfigSafe {
  id: string;
  name: string;
  providerId: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  publicBase: string;
  keyPrefix: string;
  clientApp: string;
  enabled: boolean;
}

interface FormState {
  name: string;
  providerId: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretKey: string;
  publicBase: string;
  keyPrefix: string;
  clientApp: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  providerId: "custom",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretKey: "",
  publicBase: "",
  keyPrefix: "acs/",
  clientApp: "",
  enabled: true,
};

export function StorageManager() {
  const [configs, setConfigs] = useState<StorageConfigSafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** SecretAccessKey 明文显示状态（编辑时点眼睛从后端取回） */
  const [showSecret, setShowSecret] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/storage/config");
    if (res.ok) setConfigs((await res.json()) as StorageConfigSafe[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(config: StorageConfigSafe) {
    setEditingId(config.id);
    setForm({
      name: config.name,
      providerId: config.providerId,
      endpoint: config.endpoint,
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretKey: "",
      publicBase: config.publicBase,
      keyPrefix: config.keyPrefix,
      clientApp: config.clientApp,
      enabled: config.enabled,
    });
    setShowSecret(false);
    setRevealError(null);
    setMessage(null);
    setError(null);
  }

  /** 眼睛图标：编辑时首次点击取回已保存的 SecretAccessKey，之后切换明文/掩码显示 */
  async function toggleReveal() {
    setRevealError(null);
    if (form.secretKey) {
      setShowSecret((v) => !v);
      return;
    }
    if (!editingId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/storage/config/${editingId}/reveal`);
      const data = (await res.json().catch(() => null)) as {
        secret?: string;
        error?: string;
      } | null;
      if (!res.ok || typeof data?.secret !== "string") {
        setRevealError(data?.error ?? "查看密钥失败");
        return;
      }
      setForm((prev) => ({ ...prev, secretKey: data.secret! }));
      setShowSecret(true);
    } finally {
      setBusy(false);
    }
  }

  /** 切换厂商预设：预填端点/Region；数据胶囊强制选客户端应用 */
  function applyPreset(providerId: string) {
    const preset = getPreset(providerId);
    setForm((prev) => ({
      ...prev,
      providerId,
      endpoint: preset.endpoint || "",
      region: preset.region,
      clientApp: preset.clientApp === "required" ? "s3drive" : "",
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowSecret(false);
    setRevealError(null);
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/storage/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "保存失败");
        return;
      }
      setMessage("已保存");
      resetForm();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        bucket?: string;
        error?: string;
        cause?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setError(`${data?.error ?? "连接失败"}${data?.cause ? `：${data.cause}` : ""}`);
        return;
      }
      setMessage(`连接成功，桶 ${data.bucket} 可用`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/storage/config/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (editingId === id) resetForm();
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>如何填写</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <b className="text-foreground">S3 端点</b>：对象存储 API 地址，须含协议头。缤纷云{" "}
            <code className="rounded bg-muted px-1">https://s3.cstcloud.cn</code>；阿里 OSS{" "}
            <code className="rounded bg-muted px-1">https://oss-cn-hangzhou.aliyuncs.com</code>；R2{" "}
            <code className="rounded bg-muted px-1">
              https://&lt;account&gt;.r2.cloudflarestorage.com
            </code>
            。
          </p>
          <p>
            <b className="text-foreground">公网访问基址</b>：浏览器取图的地址前缀（桶公开读或绑
            CDN）。 如桶虚拟域名为 <code className="rounded bg-muted px-1">acs.s3.cstcloud.cn</code>{" "}
            时填 <code className="rounded bg-muted px-1">https://acs.s3.cstcloud.cn</code>。
          </p>
          <p>
            <b className="text-foreground">AccessKeyId / SecretAccessKey</b>：对象存储控制台创建的
            API 密钥；SecretKey 加密保存，编辑配置时点眼睛图标可查看。
          </p>
          <p>
            <b className="text-foreground">缤纷云专用</b>：① Region 填
            <b className="text-foreground">桶详情里的服务可用区</b>（一般 cn-east-1）； ② 创建 Key
            后必须到「子账户」给该 Key<b className="text-foreground">授予桶读写权限</b>
            ，否则报 AccessDenied；③ 公网基址形如 https://桶名.s3.bitiful.net（桶名要与配置一致）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "编辑配置" : "新建配置"}</CardTitle>
          <CardDescription>
            建议使用公开读桶并填写「公网访问基址」，文章图才能公网直出；SecretKey 加密存储。
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <CardContent className="space-y-4">
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="st-name">配置名称</Label>
                <Input
                  id="st-name"
                  value={form.name}
                  placeholder="缤纷云图床"
                  onChange={(e) => update("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-provider">存储厂商</Label>
                <select
                  id="st-provider"
                  value={form.providerId}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  {S3_PROVIDER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.labelZh}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-endpoint">S3 端点（必填，含 https://）</Label>
                <Input
                  id="st-endpoint"
                  value={form.endpoint}
                  placeholder={getPreset(form.providerId).endpoint || "https://s3.example.com"}
                  onChange={(e) => update("endpoint", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {form.providerId === "data_capsule"
                    ? "数据胶囊接入点已自动填好；桶的访问域名填在「公网访问基址」（可留空走预签名）"
                    : "API 地址，须含协议头；桶的访问域名填在「公网访问基址」"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-region">Region</Label>
                <Input
                  id="st-region"
                  value={form.region}
                  placeholder="us-east-1"
                  onChange={(e) => update("region", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-bucket">桶名</Label>
                <Input
                  id="st-bucket"
                  value={form.bucket}
                  onChange={(e) => update("bucket", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-ak">AccessKeyId</Label>
                <Input
                  id="st-ak"
                  value={form.accessKeyId}
                  autoComplete="off"
                  onChange={(e) => update("accessKeyId", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-sk">
                  SecretAccessKey{editingId ? "（留空沿用已存，点眼睛查看）" : ""}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="st-sk"
                    type={showSecret && form.secretKey ? "text" : "password"}
                    value={form.secretKey}
                    autoComplete="new-password"
                    placeholder={editingId && !form.secretKey ? "已保存（点眼睛图标查看）" : ""}
                    onChange={(e) => update("secretKey", e.target.value)}
                  />
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={showSecret ? "隐藏密钥" : "显示密钥"}
                      aria-pressed={showSecret}
                      data-testid="storage-reveal"
                      disabled={busy}
                      onClick={() => void toggleReveal()}
                    >
                      {showSecret && form.secretKey ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
                {revealError && (
                  <p
                    role="alert"
                    className="text-xs text-destructive"
                    data-testid="storage-reveal-error"
                  >
                    {revealError}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-base">公网访问基址（可选）</Label>
                <Input
                  id="st-base"
                  value={form.publicBase}
                  placeholder={
                    form.providerId === "bitiful"
                      ? "https://acs.s3.bitiful.net"
                      : "https://cdn.example.com"
                  }
                  onChange={(e) => update("publicBase", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  桶公开读/绑 CDN 时填；留空走预签名链接（7 天有效，数据胶囊等无私有域厂商适用）
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-prefix">对象前缀</Label>
                <Input
                  id="st-prefix"
                  value={form.keyPrefix}
                  placeholder="acs/"
                  onChange={(e) => update("keyPrefix", e.target.value)}
                />
              </div>
              {getPreset(form.providerId).clientApp === "required" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="st-clientapp">
                    客户端应用（须与创建 AccessKey 时绑定的应用一致）
                  </Label>
                  <select
                    id="st-clientapp"
                    value={form.clientApp}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    onChange={(e) => update("clientApp", e.target.value)}
                  >
                    {S3_CLIENT_APP_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    数据胶囊网关按 User-Agent 校验请求来源，不一致会被拒绝（401）
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                id="st-enabled"
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => update("enabled", e.target.checked)}
                className="size-4 rounded border-border accent-[var(--primary)]"
              />
              <Label htmlFor="st-enabled">启用（上传分流到对象存储）</Label>
            </div>
          </CardContent>
          <CardFooter className="gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "处理中…" : "保存"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleTest()}
            >
              <PlugZapIcon className="size-4" />
              测试连接
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                取消编辑
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已有配置</CardTitle>
          <CardDescription>启用中的配置接管新上传；删除配置不影响已上传文件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {!loading && configs.length === 0 && (
            <p className="text-sm text-muted-foreground">尚未配置对象存储，当前图片走本地存储。</p>
          )}
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.enabled && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      使用中
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.bucket} · {c.endpoint} · {c.publicBase}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(c)}>
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`删除配置 ${c.name}`}
                  disabled={busy}
                  onClick={() => void handleDelete(c.id)}
                >
                  <TrashIcon className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
