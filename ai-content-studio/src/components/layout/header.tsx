import { BreadcrumbNav } from "./breadcrumb";
import { MobileSidebar } from "./mobile-sidebar";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <MobileSidebar />
      <BreadcrumbNav />
    </header>
  );
}
