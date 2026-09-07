/**
 * 从 Word 剪贴板的 RTF 数据里提取内嵌图片。
 *
 * 背景：Word 复制「图片+文字」时，浏览器 clipboardData 里没有 image/* 文件项，
 * text/html 里的 <img> 只是 file:// 本地引用（浏览器读不到）。但 Word 同时会把
 * 图片的真实字节以 hex 形式内嵌进剪贴板的 text/rtf（\pngblip / \jpegblip）。
 * 这是 CKEditor 5 paste-from-office、WordPress Gutenberg 处理 Word 图文粘贴的通用做法。
 *
 * 提取出的图片按文档顺序与 HTML 里的 file:// <img> 一一对应，用于原位替换后上传。
 */

export interface RtfImage {
  /** image/png | image/jpeg */
  type: string;
  /** data:image/...;base64,... */
  dataUrl: string;
}

// RTF 图片组头部：{ \pict ...控制词... \pngblip|\jpegblip ...}，捕获到 hex 数据开始为止。
// 惰性匹配会吞掉 \picscalex100\picwgoal... 等含非 hex 字符的控制词，直到真正的图片 hex。
// 内部一律用非捕获组，保证外层 PICTURE 的 m[1]=header、m[2]=hex。
const PICTURE_HEADER =
  /{\\pict[\s\S]+?(?:{\\\*\\blipuid\s?[\da-fA-F]+)?(?:{\s*\\sn wName\s?{\s*v[\w.]+\s?}})?[\s}]*?/;
const PICTURE = new RegExp(`(?:(${PICTURE_HEADER.source}))([\\da-fA-F\\s]+)\\}`, "g");

/** hex 字符串转 base64（分块避免大图触发 fromCharCode 参数上限） */
function hexToBase64(hex: string): string {
  const len = Math.floor(hex.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** 解析 RTF，按文档顺序返回其中的 PNG/JPEG 内嵌图片（WMF 等无法转换的跳过） */
export function extractImagesFromRtf(rtf: string): RtfImage[] {
  const out: RtfImage[] = [];
  if (!rtf) return out;
  PICTURE.lastIndex = 0;
  let m = PICTURE.exec(rtf);
  while (m !== null) {
    // m[1] = 图片组头部（含 \pngblip / \jpegblip 与各种控制词），m[2] = 紧随其后的 hex 数据
    const header = m[1] ?? "";
    let type = "";
    if (header.includes("\\pngblip")) type = "image/png";
    else if (header.includes("\\jpegblip")) type = "image/jpeg";
    if (!type) {
      m = PICTURE.exec(rtf);
      continue;
    }
    const hex = (m[2] ?? "").replace(/[^\da-fA-F]/g, "");
    // 至少凑齐一个 PNG 签名（8 hex 字符）才当作有效图片
    if (hex.length < 8) {
      m = PICTURE.exec(rtf);
      continue;
    }
    out.push({ type, dataUrl: `data:${type};base64,${hexToBase64(hex)}` });
    m = PICTURE.exec(rtf);
  }
  return out;
}
