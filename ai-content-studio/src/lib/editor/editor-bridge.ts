import type { Editor } from "@tiptap/react";

/**
 * AI Studio 中栏富文本编辑器的实例桥接。
 *
 * Tiptap Editor 是组件内实例（EditorPanel 富文本模式持有），而 store 的
 * content 是全局 Markdown 字符串。桥接解决两个方向的同步：
 *
 *  - 「应用到原文」：把 AI 生成结果直刷 editor（setContent），同时更新 store
 *  - AI 流式节流：AIChatPanel 流式期间把缓冲 markdown 节流刷入 editor
 *
 * 只有一个富文本编辑器会注册（中栏 EditorPanel），组件卸载时注销。
 * 未注册时 applyMarkdownToEditor 回退到仅更新 store（由调用方传入）。
 */

let activeEditor: Editor | null = null;

export function registerEditor(editor: Editor | null): void {
  activeEditor = editor;
}

export function unregisterEditor(): void {
  activeEditor = null;
}

export function getActiveEditor(): Editor | null {
  return activeEditor;
}

/**
 * 把 Markdown 刷入富文本编辑器。
 * 返回 true 表示已直刷 editor；false 表示无编辑器实例（调用方应回退 store）。
 */
export function applyMarkdownToEditor(md: string): boolean {
  if (!activeEditor) return false;
  // emitUpdate:false 避免触发 onUpdate 死循环（onUpdate 会写 store）
  activeEditor.commands.setContent(md, { emitUpdate: false });
  return true;
}

/** 控制富文本编辑器可编辑性（流式期间置 false 防止中途编辑半解析内容，spec §7.3） */
export function setEditorEditable(editable: boolean): boolean {
  if (!activeEditor) return false;
  activeEditor.setEditable(editable);
  return true;
}

let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let throttleLast: string | null = null;
const THROTTLE_MS = 80;

/**
 * 节流版 applyMarkdownToEditor：80ms 内多次调用只刷最后一次。
 * 供未来 AI 流式直刷原文区使用；本轮不改产品行为，仅基础设施 + 测试。
 * 返回 true 表示已排队/直刷；false 表示无编辑器实例。
 */
export function applyMarkdownThrottled(md: string): boolean {
  if (!activeEditor) return false;
  throttleLast = md;
  if (throttleTimer) return true; // 已有定时器，排队覆盖
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    if (throttleLast !== null) {
      const content = throttleLast;
      throttleLast = null;
      activeEditor?.commands.setContent(content, { emitUpdate: false });
    }
  }, THROTTLE_MS);
  return true;
}

/** 立即冲刷排队中的节流内容（流式结束时调用确保最终态落盘） */
export function flushThrottledMarkdown(): boolean {
  if (!activeEditor) return false;
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  if (throttleLast !== null) {
    const content = throttleLast;
    throttleLast = null;
    activeEditor.commands.setContent(content, { emitUpdate: false });
  }
  return true;
}
