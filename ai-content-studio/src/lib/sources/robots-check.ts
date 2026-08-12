import robotsParser from "robots-parser";
import type { RobotsStatus } from "./source-types";

/**
 * Robots 检查：按域抓 /robots.txt（robots-parser），缓存 robotsParser 实例 TTL 1h。
 * 返回 allowed / disallowed / unknown / unavailable。
 * 5xx/异常短缓存 5min 不实际阻止抓取；robots_status=allowed 绝不隐含 copyright_status=authorized。
 */

export const BOT_USER_AGENT = "AIContentStudio";

const TTL_MS = 60 * 60 * 1000;
const ERR_TTL_MS = 5 * 60 * 1000;

type RobotsInstance = ReturnType<typeof robotsParser>;
type CacheEntry =
  | { kind: "parser"; ts: number; parser: RobotsInstance }
  | { kind: "noRobots"; ts: number }
  | { kind: "err"; ts: number };

const robotsCache = new Map<string, CacheEntry>();

export interface RobotsFetchResponse {
  status: number;
  ok: boolean;
  text: string;
}

export interface RobotsCheckInput {
  url: string;
  fetcher?: (url: string) => Promise<RobotsFetchResponse>;
  now?: number;
}

export interface RobotsCheckResult {
  status: RobotsStatus;
  reason?: string;
}

async function defaultFetcher(url: string): Promise<RobotsFetchResponse> {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

function statusFromAllowed(allowed: boolean | undefined): { status: RobotsStatus } {
  if (allowed === false) return { status: "disallowed" };
  if (allowed === true) return { status: "allowed" };
  return { status: "unknown" };
}

export async function checkRobots(input: RobotsCheckInput): Promise<RobotsCheckResult> {
  let u: URL;
  try {
    u = new URL(input.url);
  } catch {
    return { status: "unavailable", reason: "非法 URL" };
  }
  const origin = `${u.protocol}//${u.host}`;
  const now = input.now ?? Date.now();

  const entry = robotsCache.get(origin);
  if (entry) {
    const ttl = entry.kind === "err" ? ERR_TTL_MS : TTL_MS;
    if (now - entry.ts < ttl) {
      if (entry.kind === "parser")
        return statusFromAllowed(entry.parser.isAllowed(u.href, BOT_USER_AGENT));
      if (entry.kind === "noRobots") return { status: "allowed" };
      return { status: "unavailable", reason: "robots 不可达（缓存）" };
    }
  }

  const fetcher = input.fetcher ?? defaultFetcher;
  try {
    const res = await fetcher(`${origin}/robots.txt`);
    if (!res.ok && res.status !== 404 && res.status !== 0) {
      robotsCache.set(origin, { kind: "err", ts: now });
      return { status: "unavailable", reason: `robots ${res.status}` };
    }
    if (res.status === 404 || !res.text) {
      robotsCache.set(origin, { kind: "noRobots", ts: now });
      return { status: "allowed" };
    }
    const parser = robotsParser(`${origin}/robots.txt`, res.text);
    robotsCache.set(origin, { kind: "parser", ts: now, parser });
    return statusFromAllowed(parser.isAllowed(u.href, BOT_USER_AGENT));
  } catch {
    robotsCache.set(origin, { kind: "err", ts: now });
    return { status: "unavailable", reason: "robots 抓取异常" };
  }
}

export function clearRobotsCache(): void {
  robotsCache.clear();
}
