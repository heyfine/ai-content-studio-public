import { auth } from "@/lib/auth";
import { BreadcrumbNav } from "./breadcrumb";
import { MobileSidebar } from "./mobile-sidebar";
import { UserNav } from "./user-nav";

export async function Header() {
  const session = await auth();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <MobileSidebar />
      <BreadcrumbNav />
      <div className="ml-auto">
        <UserNav session={session} />
      </div>
    </header>
  );
}
