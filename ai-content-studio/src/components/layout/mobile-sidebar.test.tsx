import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const pathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

import { MobileSidebar } from "./mobile-sidebar";

describe("MobileSidebar", () => {
  it("渲染打开菜单按钮", () => {
    pathname.mockReturnValue("/dashboard");
    render(<MobileSidebar />);
    expect(screen.getByLabelText("打开菜单")).toBeInTheDocument();
  });

  it("点击 trigger 可切换抽屉", () => {
    pathname.mockReturnValue("/dashboard");
    render(<MobileSidebar />);
    const trigger = screen.getByLabelText("打开菜单");
    fireEvent.click(trigger);
    // Sheet 标题应在文档中可见
    expect(screen.getByText("AI Content Studio")).toBeInTheDocument();
  });
});
