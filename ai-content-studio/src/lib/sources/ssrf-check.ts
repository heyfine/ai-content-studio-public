import { lookup } from "node:dns/promises";

/**
 * SSRF 防护：scheme allowlist + 主机黑名单 + DNS 解析后逐 IP 比对私网/不可达段。
 * resolve 注入便于测试；生产用 dns.lookup（all records）。
 */

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.azure.com",
  "169.254.169.254",
  "metadata",
]);

export interface SsrfCheckInput {
  url: string;
  resolve?: (hostname: string) => Promise<string[]>;
}

export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
  ips?: string[];
}

/** 判定单 IP 是否为私网/环回/link-local/云元数据等不可达地址 */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // 127/8 loopback
    if (a === 10) return true; // 10/8
    if (a === 0) return true; // 0/8
    if (a === 169 && b === 254) return true; // 169.254/16 link-local + 云元数据
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 192 && b === 0) return true; // 192.0.0/24+
    if (a === 198 && (b === 51 || b === 18)) return true; // benchmark/doc
    if (a === 203 && b === 0) return true; // 203.0.113 test
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7 ULA
  if (/^fe[89ab]/.test(low)) return true; // fe80::/10 link-local
  return false;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

export async function checkSsrf(input: SsrfCheckInput): Promise<SsrfCheckResult> {
  let u: URL;
  try {
    u = new URL(input.url);
  } catch {
    return { safe: false, reason: "非法 URL" };
  }
  if (!ALLOWED_SCHEMES.has(u.protocol)) {
    return { safe: false, reason: `协议不允许：${u.protocol}` };
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { safe: false, reason: `主机被禁：${host}` };
  }
  const resolve = input.resolve ?? defaultResolve;
  let ips: string[];
  try {
    ips = await resolve(host);
  } catch {
    return { safe: false, reason: `DNS 解析失败：${host}` };
  }
  if (ips.length === 0) return { safe: false, reason: `无 DNS 记录：${host}` };
  for (const ip of ips) {
    if (isPrivateIp(ip)) return { safe: false, reason: `解析到私有/不可达地址 ${ip}`, ips };
  }
  return { safe: true, ips };
}
