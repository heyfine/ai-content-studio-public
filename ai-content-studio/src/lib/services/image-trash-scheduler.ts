/**
 * 图片回收站清理调度器：服务器内 setInterval 每 5 分钟检查一次，清理 14 天未处理的回收站图片。
 * 由 src/instrumentation.ts 的 register() 在 Node 服务器启动时拉起；
 * 独立模块 + 全局守卫，避免 dev 热更新重复注册（与自动备份调度器同模式）。
 */
import { purgeExpiredImages } from "@/lib/services/image-trash-service";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const globalForScheduler = globalThis as unknown as { __acsImageTrashScheduler?: NodeJS.Timeout };

export function startImageTrashScheduler(): void {
  if (globalForScheduler.__acsImageTrashScheduler) {
    return; // 已启动（dev 热更新/多路由模块加载会重复调用 register）
  }
  globalForScheduler.__acsImageTrashScheduler = setInterval(() => {
    void purgeExpiredImages()
      .then(({ local, remote, remoteSkipped }) => {
        if (local > 0 || remote > 0) {
          console.log(
            `[image-trash] 已清理过期回收站图片：本地 ${local} 张` +
              (remoteSkipped ? "" : `，云端 ${remote} 张`),
          );
        }
      })
      .catch((err) => {
        console.error("[image-trash] 回收站清理失败:", err instanceof Error ? err.message : err);
      });
  }, CHECK_INTERVAL_MS);
  console.log("[image-trash] 回收站清理调度器已启动（每 5 分钟检查 14 天过期图片）");
}
