import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const pathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

import { Sidebar } from "./sidebar";
import { navItems } from "@/config/nav";

describe("Sidebar", () => {
  it("渲染全部导航项", () => {
    pathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    for (const it of navItems) {
      expect(screen.getByText(it.title)).toBeInTheDocument();
    }
  });

  it("当前路径对应项激活高亮", () => {
    pathname.mockReturnValue("/articles");
    const { container } = render(<Sidebar />);
    const active = container.querySelector('a[aria-current="page"]');
    expect(active).not.toBeNull();
    expect(active).toHaveTextContent("文章管理");
  });

  it("子路径下父项也激活", () => {
    pathname.mockReturnValue("/seo/anything");
    const { container } = render(<Sidebar />);
    const active = container.querySelector('a[aria-current="page"]');
    expect(active).toHaveTextContent("SEO");
  });

  it("点击触发 onNavigate 回调", async () => {
    pathname.mockReturnValue("/dashboard");
    const onNavigate = vi.fn();
    render(<Sidebar onNavigate={onNavigate} />);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByText("设置"));
    expect(onNavigate).toHaveBeenCalled();
  });
});
