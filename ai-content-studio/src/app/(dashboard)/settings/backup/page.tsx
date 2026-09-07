import { BackupManager } from "@/components/backup/backup-manager";

export default function BackupSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">备份与还原</h1>
        <p className="text-sm text-muted-foreground">
          按域导出数据为 JSON 备份文件；可配置自动备份定时推送到 WebDAV。备份含密文字段，还原库需与备份库使用同一
          ENCRYPTION_KEY。
        </p>
      </div>
      <BackupManager />
    </div>
  );
}
