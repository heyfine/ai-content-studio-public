import { auth } from "@/lib/auth";
import { BreadcrumbNav } from "./breadcrumb";
import { MobileSidebar } from "./mobile-sidebar";
import { UserNav } from "./user-nav";

export async function Header() {
  const session = await auth();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/70 px-4 backdrop-blur-xl">
      <MobileSidebar />
      <BreadcrumbNav />
      <div className="ml-auto">
        <UserNav session={session} />
      </div>
    </header>
  );
}
