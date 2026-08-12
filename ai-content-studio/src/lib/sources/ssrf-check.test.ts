import { describe, expect, it } from "vitest";
import { checkSsrf, isPrivateIp } from "./ssrf-check";

const pubIp = () => Promise.resolve(["142.250.0.1"]);

describe("isPrivateIp", () => {
  it("IPv4 私网段返回 true", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("0.0.0.0")).toBe(true);
  });
  it("172.32+ 不属私网（边界）", () => {
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("172.15.0.1")).toBe(false);
  });
  it("公网 IP 返回 false", () => {
    expect(isPrivateIp("142.250.0.1")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
  it("IPv6 环回/ULA/link-local 返回 true", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("::")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });
  it("IPv4-mapped IPv6 按内嵌 IPv4 判定", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:142.250.0.1")).toBe(false);
  });
});

describe("checkSsrf", () => {
  it("公网 IP 放行", async () => {
    const r = await checkSsrf({ url: "https://example.com", resolve: pubIp });
    expect(r.safe).toBe(true);
    expect(r.ips).toEqual(["142.250.0.1"]);
  });

  it("解析到私网 IP 阻断", async () => {
    expect(
      (await checkSsrf({ url: "https://ex.com", resolve: () => Promise.resolve(["127.0.0.1"]) }))
        .safe,
    ).toBe(false);
    expect(
      (
        await checkSsrf({
          url: "https://ex.com",
          resolve: () => Promise.resolve(["169.254.169.254"]),
        })
      ).safe,
    ).toBe(false);
    expect(
      (await checkSsrf({ url: "https://ex.com", resolve: () => Promise.resolve(["::1"]) })).safe,
    ).toBe(false);
  });

  it("任一解析地址私网即阻断（混入）", async () => {
    const r = await checkSsrf({
      url: "https://ex.com",
      resolve: () => Promise.resolve(["142.250.0.1", "10.0.0.1"]),
    });
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/10\.0\.0\.1/);
  });

  it("主机黑名单阻断（localhost / 云元数据主机）", async () => {
    expect((await checkSsrf({ url: "http://localhost/x", resolve: pubIp })).safe).toBe(false);
    expect(
      (await checkSsrf({ url: "http://metadata.google.internal/x", resolve: pubIp })).safe,
    ).toBe(false);
    expect((await checkSsrf({ url: "http://169.254.169.254/x", resolve: pubIp })).safe).toBe(false);
  });

  it("非 http/https 协议阻断", async () => {
    expect((await checkSsrf({ url: "ftp://example.com", resolve: pubIp })).safe).toBe(false);
    expect((await checkSsrf({ url: "file:///etc/passwd", resolve: pubIp })).safe).toBe(false);
  });

  it("非法 URL 阻断", async () => {
    expect((await checkSsrf({ url: "not a url", resolve: pubIp })).safe).toBe(false);
  });

  it("DNS 失败/无记录阻断", async () => {
    expect(
      (
        await checkSsrf({
          url: "https://ex.com",
          resolve: () => Promise.reject(new Error("enoent")),
        })
      ).safe,
    ).toBe(false);
    expect(
      (await checkSsrf({ url: "https://ex.com", resolve: () => Promise.resolve([]) })).safe,
    ).toBe(false);
  });
});
