import type { PropsWithChildren } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      {/* 主区顶部氛围光：极淡品牌渐变，让内容页不呆板 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent"
      />
      <aside className="relative hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-chart-5 text-sm font-black text-primary-foreground shadow-md shadow-primary/25">
            A
          </span>
          <span className="text-sm font-semibold tracking-tight">AI Content Studio</span>
        </div>
        <Sidebar />
      </aside>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
