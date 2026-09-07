import { describe, expect, it } from "vitest";
import { extractImageUrls, isLocalImageUrl, LOCAL_IMAGE_NAME_RE } from "./image-urls";

describe("extractImageUrls", () => {
  it("提取 markdown 图片语法", () => {
    const md = "正文 ![图一](https://a.com/1.png) 和 ![图二](https://b.com/2.jpg)";
    expect(extractImageUrls(md)).toEqual(["https://a.com/1.png", "https://b.com/2.jpg"]);
  });

  it("提取 HTML img 标签", () => {
    const md = '<p>正文</p><img src="/uploads/abc.png" alt="x">';
    expect(extractImageUrls(md)).toEqual(["/uploads/abc.png"]);
  });

  it("两种语法混用去重", () => {
    const md = '![a](/uploads/x.png) <img src="/uploads/x.png">';
    expect(extractImageUrls(md)).toEqual(["/uploads/x.png"]);
  });

  it("跳过 data:/blob: 内嵌图", () => {
    const md =
      "![d](data:image/png;base64,AAAA) !![b](blob:https://x/abc) ![ok](https://c.com/1.jpg)";
    expect(extractImageUrls(md)).toEqual(["https://c.com/1.jpg"]);
  });

  it("无图片返回空数组", () => {
    expect(extractImageUrls("纯文本")).toEqual([]);
  });
});

describe("isLocalImageUrl / LOCAL_IMAGE_NAME_RE", () => {
  it("本地图片库 URL 识别", () => {
    expect(isLocalImageUrl("/uploads/abc.png")).toBe(true);
    expect(isLocalImageUrl("https://a.com/1.png")).toBe(false);
  });

  it("文件名白名单：uuid+扩展名才合法（防穿越）", () => {
    const uuid = "01234567-89ab-cdef-0123-456789abcdef";
    expect(LOCAL_IMAGE_NAME_RE.test(`${uuid}.png`)).toBe(true);
    expect(LOCAL_IMAGE_NAME_RE.test(`${uuid}.jpg`)).toBe(true);
    expect(LOCAL_IMAGE_NAME_RE.test(`${uuid}.gif`)).toBe(true);
    expect(LOCAL_IMAGE_NAME_RE.test(`${uuid}.webp`)).toBe(true);
    expect(LOCAL_IMAGE_NAME_RE.test("../../etc/passwd")).toBe(false);
    expect(LOCAL_IMAGE_NAME_RE.test(`${uuid}.svg`)).toBe(false);
    expect(LOCAL_IMAGE_NAME_RE.test("abc.png")).toBe(false);
  });
});
