/**
 * 富文本写剪贴板：优先 Async Clipboard API（text/html + text/plain 同时写入），
 * 环境不支持（如 Firefox）或权限被拒时降级隐藏 contenteditable + execCommand("copy")。
 * 返回是否复制成功，由调用方决定提示。
 */
export async function copyRichText(html: string, plainText: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // 写入失败（权限被拒/格式不支持）→ 走 execCommand 兜底
    }
  }
  return copyViaExecCommand(html);
}

function copyViaExecCommand(html: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }
  const container = document.createElement("div");
  container.setAttribute("contenteditable", "true");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.innerHTML = html;
  document.body.appendChild(container);
  const selection = window.getSelection();
  if (!selection) {
    container.remove();
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(container);
  selection.removeAllRanges();
  selection.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  selection.removeAllRanges();
  container.remove();
  return ok;
}
