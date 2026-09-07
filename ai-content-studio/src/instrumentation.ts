/** Next.js 服务器启动钩子：拉起自动备份调度器（仅 Node runtime） */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoBackupScheduler } = await import("@/lib/services/auto-backup-scheduler");
    startAutoBackupScheduler();
  }
}
