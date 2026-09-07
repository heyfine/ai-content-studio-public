import { describe, expect, it } from "vitest";
import { extractImagesFromRtf } from "./rtf-images";

describe("extractImagesFromRtf", () => {
  it("空/无图片 RTF 返回空数组", () => {
    expect(extractImagesFromRtf("")).toEqual([]);
    expect(extractImagesFromRtf("{\\rtf1\\ansi hello}")).toEqual([]);
  });

  it("提取 pngblip 内嵌图：hex 转 base64（PNG 签名 89504e47 → iVBORw==）", () => {
    const rtf =
      "{\\rtf1{\\pict\\picscalex100\\picscaley100\\picwgoal3000\\pichgoal3000\\pngblip 89504e47}}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe("image/png");
    expect(imgs[0].dataUrl).toBe("data:image/png;base64,iVBORw==");
  });

  it("提取 jpegblip 内嵌图（JPEG 签名 ffd8ffe0 → 可解析）", () => {
    const rtf = "{\\pict\\jpegblip ffd8ffe000104a46}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe("image/jpeg");
    expect(imgs[0].dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("多张图按文档顺序返回", () => {
    const rtf = "{\\pict\\pngblip 89504e47}{\\pict\\jpegblip ffd8ffe0}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs.map((i) => i.type)).toEqual(["image/png", "image/jpeg"]);
  });

  it("WMF 矢量图（\\wmetafile）无法转换 → 跳过", () => {
    const rtf = "{\\pict\\wmetafile8 01000900}";
    expect(extractImagesFromRtf(rtf)).toEqual([]);
  });

  it("hex 含换行/空白也能正确解析", () => {
    const rtf = "{\\pict\\pngblip 89504e\n470d0a}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    // 89504e470d0a → 6 字节
    expect(imgs[0].dataUrl).toBe(
      `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString("base64")}`,
    );
  });
});
