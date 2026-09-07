import { describe, expect, it } from "vitest";
import { beijingStamp, formatDateTime, formatTime } from "./datetime";

describe("datetime 统一北京墙钟格式化", () => {
  // UTC 2026-09-07 04:30 == 北京时间 2026-09-07 12:30
  const utcInput = "2026-09-07T04:30:00.000Z";

  it("formatDateTime：UTC 输入按北京墙钟渲染（+8h）", () => {
    expect(formatDateTime(utcInput)).toBe("2026-09-07 12:30");
  });

  it("formatDateTime：null/空/非法值返回占位符", () => {
    expect(formatDateTime(null)).toBe("--");
    expect(formatDateTime("")).toBe("--");
    expect(formatDateTime("not-a-date")).toBe("--");
  });

  it("formatTime：仅时分且按北京墙钟", () => {
    expect(formatTime(utcInput)).toBe("12:30");
  });

  it("beijingStamp：文件名安全时间戳（北京墙钟）", () => {
    const ms = Date.parse("2026-09-07T04:30:09.000Z");
    expect(beijingStamp(ms)).toBe("2026-09-07-12-30-09");
  });
});
