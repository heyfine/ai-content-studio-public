import type { PropsWithChildren } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center border-b px-4 text-sm font-semibold">
          AI Content Studio
        </div>
        <Sidebar />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
