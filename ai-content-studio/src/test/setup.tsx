import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import React from "react";

afterEach(() => {
  cleanup();
});

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: Record<string, unknown>) =>
    React.createElement("img", { alt, ...props }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: () => ({}),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
