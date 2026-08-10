import { describe, it, expect } from "vitest";
import { authConfig } from "./auth.config";

const req = (path: string) => ({ nextUrl: new URL("https://x" + path) }) as never;

describe("authConfig.authorized", () => {
  const authorized = authConfig.callbacks.authorized as (a: unknown, r: unknown) => unknown;

  it("未登录访问 dashboard 拒绝", () => {
    expect(authorized({ auth: null, request: req("/dashboard") })).toBe(false);
  });

  it("已登录访问 dashboard 放行", () => {
    expect(authorized({ auth: { user: { email: "a" } }, request: req("/dashboard") })).toBe(true);
  });

  it("已登录访问 /login 重定向到 /dashboard", () => {
    const r = authorized({ auth: { user: { email: "a" } }, request: req("/login") });
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(302);
    expect((r as Response).headers.get("location")).toContain("/dashboard");
  });

  it("未登录访问 /login 放行", () => {
    expect(authorized({ auth: null, request: req("/login") })).toBe(true);
  });
});

describe("authConfig.jwt", () => {
  const jwt = authConfig.callbacks.jwt as (a: unknown) => Promise<unknown>;

  it("user 存在时注入 role", async () => {
    const token = await jwt({ token: {}, user: { role: "ADMIN" } });
    expect(token).toMatchObject({ role: "ADMIN" });
  });

  it("无 user 时保持 token", async () => {
    const token = await jwt({ token: { x: 1 }, user: undefined });
    expect(token).toMatchObject({ x: 1 });
  });
});

describe("authConfig.session", () => {
  const session = authConfig.callbacks.session as (a: unknown) => Promise<unknown>;

  it("注入 id 与 role", async () => {
    const r = await session({ token: { sub: "u1", role: "ADMIN" }, session: { user: {} } });
    expect(r).toMatchObject({ user: { id: "u1", role: "ADMIN" } });
  });

  it("role 缺省时回退 EDITOR", async () => {
    const r = await session({ token: { sub: "u1" }, session: { user: {} } });
    expect(r).toMatchObject({ user: { id: "u1", role: "EDITOR" } });
  });
});
