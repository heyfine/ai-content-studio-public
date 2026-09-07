/**
 * 自动备份调度器：服务器内 setInterval 每 5 分钟检查一次到点目标。
 * 由 src/instrumentation.ts 的 register() 在 Node 服务器启动时拉起；
 * 独立模块 + 全局守卫，避免 dev 热更新重复注册。
 */
import { runAutoBackup } from "@/lib/services/auto-backup-service";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const globalForScheduler = globalThis as unknown as { __acsBackupScheduler?: NodeJS.Timeout };

export function startAutoBackupScheduler(): void {
  if (globalForScheduler.__acsBackupScheduler) {
    return; // 已启动（dev 热更新/多路由模块加载会重复调用 register）
  }
  globalForScheduler.__acsBackupScheduler = setInterval(() => {
    void runAutoBackup().catch((err) => {
      console.error("[auto-backup] 定时备份失败:", err instanceof Error ? err.message : err);
    });
  }, CHECK_INTERVAL_MS);
  console.log("[auto-backup] 调度器已启动（每 5 分钟检查到点目标）");
}
