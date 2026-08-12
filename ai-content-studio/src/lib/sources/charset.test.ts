import { describe, expect, it } from "vitest";
import { decodeBuffer, detectCharset } from "./charset";

// GBK 字节：中=D6D0 文=CEC4 正=D6B7
const GBK_ZHONGWEN = Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4);
const GBK_ZHENG = 0xd6;
const GBK_ZHENG2 = 0xb7;

describe("detectCharset", () => {
  it("Content-Type charset 优先", () => {
    expect(detectCharset("text/html; charset=gbk")).toBe("gbk");
    expect(detectCharset("TEXT/HTML; CHARSET=UTF-8")).toBe("utf-8");
  });

  it("无 header 时回退 meta charset（前 1KB）", () => {
    const html = `<html><head><meta charset="gbk"></head><body></body></html>`;
    const buf = new TextEncoder().encode(html).buffer;
    expect(detectCharset(undefined, buf)).toBe("gbk");
  });

  it("回退 http-equiv Content-Type meta", () => {
    const html = `<head><meta http-equiv="Content-Type" content="text/html; charset=gb18030"></head>`;
    const buf = new TextEncoder().encode(html).buffer;
    expect(detectCharset(undefined, buf)).toBe("gb18030");
  });

  it("无任何声明默认 utf-8", () => {
    const buf = new TextEncoder().encode("<html>plain</html>").buffer;
    expect(detectCharset(undefined, buf)).toBe("utf-8");
    expect(detectCharset(undefined, undefined)).toBe("utf-8");
  });
});

describe("decodeBuffer", () => {
  it("按 Content-Type 解码 GBK", () => {
    const text = decodeBuffer(GBK_ZHONGWEN.buffer, "text/html; charset=gbk");
    expect(Array.from(text).some((ch) => ch === "中" || ch.codePointAt(0) === 0x4e2d)).toBe(true);
    expect(text).toContain("文");
  });

  it("header charset 优先于 meta", () => {
    const html = `<meta charset="gbk"><body>${"\u4e2d\u6587"}</body>`;
    const buf = new TextEncoder().encode(html).buffer;
    expect(decodeBuffer(buf, "text/html; charset=utf-8")).toContain("\u4e2d\u6587");
  });

  it("不支持的 charset 回退 UTF-8 不抛", () => {
    const buf = new TextEncoder().encode("ok").buffer;
    expect(() => decodeBuffer(buf, "text/html; charset=this-encoding-does-not-exist")).not.toThrow();
    expect(decodeBuffer(buf, "text/html; charset=this-encoding-does-not-exist")).toContain("ok");
  });
});