import { describe, expect, it } from "vitest";
import { extractImagesFromRtf } from "./rtf-images";

// PNG 签名 hex（8 字节）
const PNG_HEX = "89504e470d0a1a0a";

describe("extractImagesFromRtf", () => {
  it("空/无图片 RTF 返回空数组", () => {
    expect(extractImagesFromRtf("")).toEqual([]);
    expect(extractImagesFromRtf("{\\rtf1\\ansi hello}")).toEqual([]);
  });

  it("真实 Word 结构：\\pngblip 后跟 {\\*\\blipuid} 子组再接 hex", () => {
    const rtf =
      "{\\rtf1\\ansi{\\*\\generator Riched20;}\\pard\\f0\\fs24 \\u36825\\par " +
      "{\\pict{\\*\\picprop}\\picscalex41\\picw2400\\pich1350\\pngblip{\\*\\blipuid 49b96e0949b96e09}" +
      PNG_HEX +
      "}\\par}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe("image/png");
    expect(imgs[0].dataUrl).toBe(
      `data:image/png;base64,${Buffer.from(PNG_HEX, "hex").toString("base64")}`,
    );
  });

  it("shppict(EMF 渲染版) + nonshppict(pngblip 原图) 双 pict：只取 pngblip 一张", () => {
    const rtf =
      "{\\rtf1{\\*\\shppict{\\pict{\\*\\picprop}\\picw2400\\emfblip 010009000002}}}" +
      "{\\nonshppict{\\pict\\pngblip{\\*\\blipuid aabbccdd}" +
      PNG_HEX +
      "}}}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe("image/png");
  });

  it("jpegblip 内嵌图", () => {
    const rtf = "{\\pict\\jpegblip ffd8ffe000104a46}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe("image/jpeg");
    expect(imgs[0].dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("多张图按文档顺序返回", () => {
    const rtf =
      "{\\pict\\pngblip 89504e470d0a1a0a}{\\pict\\jpegblip{\\*\\blipuid 11223344}ffd8ffe000104a46}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs.map((i) => i.type)).toEqual(["image/png", "image/jpeg"]);
  });

  it("EMF/WMF 矢量图无法转换 → 跳过", () => {
    const rtf = "{\\pict\\wmetafile8 01000900}{\\pict\\emfblip 01000000}";
    expect(extractImagesFromRtf(rtf)).toEqual([]);
  });

  it("hex 含换行/空白分段也能正确解析", () => {
    const rtf = "{\\pict\\pngblip 89504e\n470d0a1a0a}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].dataUrl).toBe(
      `data:image/png;base64,${Buffer.from("89504e470d0a1a0a", "hex").toString("base64")}`,
    );
  });

  it("blip 标记与 hex 之间的控制词（\\par 等）被跳过", () => {
    const rtf = "{\\pict\\pngblip \\par " + PNG_HEX + "}";
    const imgs = extractImagesFromRtf(rtf);
    expect(imgs).toHaveLength(1);
  });
});
