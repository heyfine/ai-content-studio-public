import { WechatAccountManager } from "@/components/wechat/wechat-account-manager";
import { PublishClient } from "@/components/wordpress/publish-client";

export default function Page() {
  return (
    <div className="space-y-8">
      <PublishClient />
      <WechatAccountManager />
    </div>
  );
}
