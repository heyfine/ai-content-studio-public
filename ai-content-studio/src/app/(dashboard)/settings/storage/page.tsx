import { StorageManager } from "@/components/storage/storage-manager";

export default function StorageSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">对象存储</h1>
        <p className="text-sm text-muted-foreground">
          接入 S3 兼容对象存储（缤纷云 / 阿里 OSS / 腾讯 COS / Cloudflare R2 /
          MinIO）。启用后新上传图片直传云桶，URL 公网直出；未启用时图片落本地。
        </p>
      </div>
      <StorageManager />
    </div>
  );
}
