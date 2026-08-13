import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  applyMarkdownToEditor,
  applyMarkdownThrottled,
  flushThrottledMarkdown,
  getActiveEditor,
  registerEditor,
  setEditorEditable,
  unregisterEditor,
} from "./editor-bridge";

function makeEditorStub() {
  return {
    commands: { setContent: vi.fn() },
    setEditable: vi.fn(),
  };
}

describe("editor-bridge", () => {
  beforeEach(() => {
    unregisterEditor();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    unregisterEditor();
  });

  it("registerEditor/getActiveEditor/unregisterEditor", () => {
    const e = makeEditorStub();
    expect(getActiveEditor()).toBeNull();
    registerEditor(e as never);
    expect(getActiveEditor()).toBe(e);
    unregisterEditor();
    expect(getActiveEditor()).toBeNull();
  });

  it("applyMarkdownToEditor 直刷 setContent 且 emitUpdate:false", () => {
    const e = makeEditorStub();
    registerEditor(e as never);
    const ok = applyMarkdownToEditor("# 标题");
    expect(ok).toBe(true);
    expect(e.commands.setContent).toHaveBeenCalledWith("# 标题", {
      emitUpdate: false,
    });
  });

  it("applyMarkdownToEditor 无编辑器时返回 false", () => {
    expect(applyMarkdownToEditor("x")).toBe(false);
  });

  it("setEditorEditable 透传可编辑状态", () => {
    const e = makeEditorStub();
    registerEditor(e as never);
    expect(setEditorEditable(false)).toBe(true);
    expect(e.setEditable).toHaveBeenCalledWith(false);
    expect(setEditorEditable(true)).toBe(true);
    expect(e.setEditable).toHaveBeenCalledWith(true);
  });

  it("applyMarkdownThrottled 80ms 内多次调用只刷最后一次", () => {
    const e = makeEditorStub();
    registerEditor(e as never);
    applyMarkdownThrottled("第一段");
    applyMarkdownThrottled("第二段");
    applyMarkdownThrottled("第三段");
    expect(e.commands.setContent).not.toHaveBeenCalled(); // 尚未到节流窗口
    vi.advanceTimersByTime(80);
    expect(e.commands.setContent).toHaveBeenCalledTimes(1);
    expect(e.commands.setContent).toHaveBeenCalledWith("第三段", {
      emitUpdate: false,
    });
  });

  it("flushThrottledMarkdown 立即冲刷排队内容", () => {
    const e = makeEditorStub();
    registerEditor(e as never);
    applyMarkdownThrottled("最终态");
    expect(e.commands.setContent).not.toHaveBeenCalled();
    expect(flushThrottledMarkdown()).toBe(true);
    expect(e.commands.setContent).toHaveBeenCalledWith("最终态", {
      emitUpdate: false,
    });
    // 冲刷后再 flush 无内容可刷
    vi.advanceTimersByTime(80);
    expect(e.commands.setContent).toHaveBeenCalledTimes(1);
  });

  it("applyMarkdownThrottled 无编辑器时返回 false", () => {
    expect(applyMarkdownThrottled("x")).toBe(false);
  });
});
