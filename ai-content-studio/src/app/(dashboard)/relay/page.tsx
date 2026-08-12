import { RelayKeysClient } from "@/components/relay/relay-keys-client";

export default function RelayPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API 中转</h1>
        <p className="text-sm text-muted-foreground">对外 OpenAI 兼容接口与中转密钥管理。</p>
      </div>
      <RelayKeysClient />
    </div>
  );
}
