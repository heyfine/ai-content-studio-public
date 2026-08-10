import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

import { BreadcrumbNav } from "./breadcrumb";

describe("BreadcrumbNav", () => {
  it("显示根 ACS 与当前页名", () => {
    pathname.mockReturnValue("/articles");
    render(<BreadcrumbNav />);
    expect(screen.getByText("ACS")).toBeInTheDocument();
    expect(screen.getByText("文章管理")).toBeInTheDocument();
  });

  it("未匹配时回退显示仪表盘", () => {
    pathname.mockReturnValue("/unknown");
    render(<BreadcrumbNav />);
    expect(screen.getByText("仪表盘")).toBeInTheDocument();
  });
});
