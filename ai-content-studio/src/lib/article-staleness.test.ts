import { describe, it, expect } from "vitest";
import {
  isStaleArticle,
  stalenessReasons,
  rankStaleArticles,
  STALENESS_DEFAULTS,
  type StalenessOptions,
} from "./article-staleness";

const NOW = new Date("2026-08-11T10:00:00Z");
const opts = (o: Partial<StalenessOptions> = {}): StalenessOptions => ({ now: NOW, ...o });

describe("article-staleness", () => {
  it("默认阈值：90 天 / 60 分", () => {
    expect(STALENESS_DEFAULTS.maxAgeDays).toBe(90);
    expect(STALENESS_DEFAULTS.lowSeoThreshold).toBe(60);
  });

  it("年龄超 90 天判过期（与 seoScore 无关）", () => {
    const old = { updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 90 };
    expect(isStaleArticle(old, opts())).toBe(true);
  });

  it("年龄未超且 seoScore 高判不过期", () => {
    const fresh = { updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 88 };
    expect(isStaleArticle(fresh, opts())).toBe(false);
  });

  it("低质 seoScore < 60 判过期（即便刚更新）", () => {
    const low = { updatedAt: new Date("2026-08-11T00:00:00Z"), seoScore: 49 };
    expect(isStaleArticle(low, opts())).toBe(true);
  });

  it("seoScore=null 不触发低质，仅年龄判", () => {
    const freshNull = { updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: null };
    expect(isStaleArticle(freshNull, opts())).toBe(false);
    const oldNull = { updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: null };
    expect(isStaleArticle(oldNull, opts())).toBe(true);
  });

  it("可自定义阈值", () => {
    const days30 = { updatedAt: new Date("2026-07-01T00:00:00Z"), seoScore: 80 };
    expect(isStaleArticle(days30, opts())).toBe(false); // 41 天 < 90
    expect(isStaleArticle(days30, opts({ maxAgeDays: 30 }))).toBe(true); // 41 天 > 30
    const high70 = { updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 65 };
    expect(isStaleArticle(high70, opts())).toBe(false); // 65 >= 60
    expect(isStaleArticle(high70, opts({ lowSeoThreshold: 70 }))).toBe(true); // 65 < 70
  });

  it("stalenessReasons 给出双维度原因", () => {
    const a = stalenessReasons(
      { updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 40 },
      opts(),
    );
    expect(a.aged).toBe(true);
    expect(a.lowSeo).toBe(true);
    expect(a.ageDays).toBeGreaterThan(200);
    const b = stalenessReasons(
      { updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 40 },
      opts(),
    );
    expect(b.aged).toBe(false);
    expect(b.lowSeo).toBe(true);
  });

  it("接受 ISO 字符串 updatedAt", () => {
    const old = { updatedAt: "2026-01-01T00:00:00Z" as const, seoScore: 80 };
    expect(isStaleArticle(old, opts())).toBe(true);
  });

  it("rankStaleArticles 筛出 stale 并按低分→最早排序", () => {
    const list = [
      { updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 88 }, // fresh, 排除
      { updatedAt: new Date("2026-08-09T00:00:00Z"), seoScore: 45 }, // 低质(45)
      { updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 30 }, // 低质(30)+过期
      { updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 50 }, // 低质(50)
    ];
    const ranked = rankStaleArticles(list, opts());
    expect(ranked).toHaveLength(3);
    expect(ranked.map((a) => a.seoScore)).toEqual([30, 45, 50]);
  });

  it("rankStaleArticles 同分按 updatedAt 升序", () => {
    const list = [
      { updatedAt: new Date("2026-05-01T00:00:00Z"), seoScore: 40 },
      { updatedAt: new Date("2026-01-01T00:00:00Z"), seoScore: 40 },
    ];
    const ranked = rankStaleArticles(list, opts());
    expect(ranked[0].updatedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("rankStaleArticles 无 stale 返回空数组", () => {
    const list = [{ updatedAt: new Date("2026-08-10T00:00:00Z"), seoScore: 90 }];
    expect(rankStaleArticles(list, opts())).toEqual([]);
  });
});
