import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOT_USER_AGENT, checkRobots, clearRobotsCache } from "./robots-check";

const mkFetcher = (status: number, text: string) =>
  vi.fn(async () => ({ status, ok: status >= 200 && status < 300, text }));

beforeEach(() => {
  clearRobotsCache();
});

describe("checkRobots", () => {
  it("Disallow 规则 → disallowed", async () => {
    const fetcher = mkFetcher(200, `User-agent: *\nDisallow: /private\n`);
    const r = await checkRobots({ url: "https://ex.com/private", fetcher });
    expect(r.status).toBe("disallowed");
  });

  it("未命中规则 → allowed", async () => {
    const fetcher = mkFetcher(200, `User-agent: *\nDisallow: /private\n`);
    const r = await checkRobots({ url: "https://ex.com/open", fetcher });
    expect(r.status).toBe("allowed");
  });

  it("404 → allowed（无 robots 限制）", async () => {
    const r = await checkRobots({ url: "https://ex.com/a", fetcher: mkFetcher(404, "") });
    expect(r.status).toBe("allowed");
  });

  it("5xx → unavailable", async () => {
    const r = await checkRobots({ url: "https://ex.com/a", fetcher: mkFetcher(500, "") });
    expect(r.status).toBe("unavailable");
  });

  it("fetcher 抛异常 → unavailable", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("boom");
    });
    const r = await checkRobots({ url: "https://ex.com/a", fetcher });
    expect(r.status).toBe("unavailable");
  });

  it("User-agent 指定：对本 bot 单独 Disallow 生效", async () => {
    const text = `User-agent: ${BOT_USER_AGENT}\nDisallow: /agent-only\nUser-agent: *\nAllow: /`;
    const r1 = await checkRobots({
      url: "https://ex.com/agent-only",
      fetcher: mkFetcher(200, text),
    });
    expect(r1.status).toBe("disallowed");
    const r2 = await checkRobots({ url: "https://ex.com/other", fetcher: mkFetcher(200, text) });
    expect(r2.status).toBe("allowed");
  });

  it("缓存命中：1h 内不重复抓 robots", async () => {
    const fetcher = mkFetcher(200, `User-agent: *\nDisallow: /\n`);
    await checkRobots({ url: "https://ex.com/x", fetcher, now: 1_000_000 });
    await checkRobots({ url: "https://ex.com/y", fetcher, now: 1_000_000 + 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const r = await checkRobots({
      url: "https://ex.com/z",
      fetcher,
      now: 1_000_000 + 2 * 60 * 60 * 1000,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("disallowed");
  });

  it("非法 URL → unavailable", async () => {
    const r = await checkRobots({ url: "not a url", fetcher: mkFetcher(200, "") });
    expect(r.status).toBe("unavailable");
  });
});
