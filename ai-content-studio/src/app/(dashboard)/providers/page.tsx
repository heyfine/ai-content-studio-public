import { ProvidersManager } from "@/components/providers/providers-manager";

export default function ProvidersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI 模型</h1>
        <p className="text-sm text-muted-foreground">管理 AI 供应商、模型与连通测试。</p>
      </div>
      <ProvidersManager />
    </div>
  );
}
