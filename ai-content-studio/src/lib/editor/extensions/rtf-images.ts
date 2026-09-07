/**
 * 从 Word 剪贴板的 RTF 数据里提取内嵌图片。
 *
 * 背景：Word 复制「图片+文字」时，浏览器 clipboardData 里没有 image/* 文件项，
 * text/html 里的 <img> 只是 file:// 本地引用（浏览器读不到）。但 Word 同时会把
 * 图片的真实字节以 hex 形式内嵌进剪贴板的 text/rtf（\pngblip / \jpegblip）。
 * Chrome/Edge 的 paste 事件确实暴露 text/rtf（实测 Windows + Word 8.8MB RTF 可读）。
 * 这是 CKEditor 5 paste-from-office、WordPress Gutenberg 处理 Word 图文粘贴的通用做法。
 *
 * 真实 Word 剪贴板 RTF 的图片组结构（2026-09-07 实测）：
 *   {\*\shppict{\pict {\*\picprop {\sp {\sn shapeType}{\sv 75}}...} \picw2400 ... \emfblip...}}
 *   {\nonshppict{\pict ... \pngblip {\*\blipuid 49b9...}89504e47...hex...}}
 * 要点：
 * - 同一张图 Word 会写两个 pict：shppict（\emfblip/\wmetafile 渲染版）+ nonshppict（\pngblip 原图字节）
 * - \pngblip 后可能有 {\*\blipuid xxx} 子组（内容也是 hex！），必须整组跳过后再抓 hex
 * - 控制词 \picw2400 等含 hex 字符，不能靠单一巨型正则硬吞 → 两步定位法
 *
 * 提取出的图片按文档顺序与 HTML 里的 file:// <img> 一一对应，用于原位替换后上传。
 */

export interface RtfImage {
  /** image/png | image/jpeg */
  type: string;
  /** data:image/...;base64,... */
  dataUrl: string;
}

const BLIP_MARK = /\\(pngblip|jpegblip)\b/g;

/** 跳过 blip 标记与 hex 数据之间的空白/嵌套子组/控制词，返回起始下标（失败 -1） */
function skipToHexStart(str: string, i: number): number {
  while (i < str.length) {
    const c = str[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "{") {
      // 嵌套子组（如 {\*\blipuid 49b9...}，内容也是 hex，必须整组跳过）：找配对右括号
      let depth = 0;
      let j = i;
      for (; j < str.length; j++) {
        if (str[j] === "{") depth += 1;
        else if (str[j] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (j >= str.length) return -1;
      i = j + 1;
      continue;
    }
    if (c === "\\") {
      // 控制词：\字母[参数] 或符号控制（\'xx 跳 3 字符，其余跳 2）
      let j = i + 1;
      if (j < str.length && /[a-zA-Z]/.test(str[j])) {
        while (j < str.length && /[a-zA-Z]/.test(str[j])) j += 1;
        if (j < str.length && str[j] === "-") j += 1;
        while (j < str.length && /[0-9]/.test(str[j])) j += 1;
        if (j < str.length && str[j] === " ") j += 1;
      } else if (j < str.length && str[j] === "'") {
        j += 3;
      } else {
        j += 1;
      }
      i = j;
      continue;
    }
    break;
  }
  return i;
}

/** 从 str 的 pos 起抓第一段连续 hex（容忍换行/空白分段），长度不足 8 返回 null */
function takeHexRun(str: string, pos: number): string | null {
  let i = skipToHexStart(str, pos);
  if (i < 0 || i >= str.length) return null;
  let hex = "";
  while (i < str.length) {
    const c = str[i];
    if (/[0-9a-fA-F]/.test(c)) {
      hex += c;
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      // 空白后仍是 hex → 换行分段的 hex，继续收；否则到此为止
      let j = i;
      while (j < str.length && /\s/.test(str[j])) j += 1;
      if (j < str.length && /[0-9a-fA-F]/.test(str[j])) {
        i = j;
        continue;
      }
      break;
    }
    break;
  }
  return hex.length >= 8 ? hex : null;
}

/** hex 字符串转 base64（分块避免大图触发 fromCharCode 参数上限） */
function hexToBase64(hex: string): string {
  const len = Math.floor(hex.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** 解析 RTF，按文档顺序返回其中的 PNG/JPEG 内嵌图片（EMF/WMF 渲染版自动跳过） */
export function extractImagesFromRtf(rtf: string): RtfImage[] {
  const out: RtfImage[] = [];
  if (!rtf) return out;
  BLIP_MARK.lastIndex = 0;
  let m = BLIP_MARK.exec(rtf);
  while (m !== null) {
    const type = m[1] === "pngblip" ? "image/png" : "image/jpeg";
    const hex = takeHexRun(rtf, m.index + m[0].length);
    if (hex) {
      out.push({ type, dataUrl: `data:${type};base64,${hexToBase64(hex)}` });
    }
    m = BLIP_MARK.exec(rtf);
  }
  return out;
}
