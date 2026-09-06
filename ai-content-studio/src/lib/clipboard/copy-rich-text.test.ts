import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyRichText } from "./copy-rich-text";

const HTML = "<section><p>hello</p></section>";

describe("copyRichText", () => {
  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Clipboard API 可用时写入 text/html + text/plain 并返回 true", async () => {
    const write = vi.fn(async (_items: unknown[]) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { write },
      configurable: true,
    });
    class FakeClipboardItem {
      constructor(public data: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);

    const ok = await copyRichText(HTML, "hello");
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const items = write.mock.calls[0][0] as Array<InstanceType<typeof FakeClipboardItem>>;
    const item = items[0];
    expect(item.data["text/html"]).toBeInstanceOf(Blob);
    expect(await item.data["text/html"].text()).toBe(HTML);
    expect(await item.data["text/plain"].text()).toBe("hello");
  });

  it("Clipboard API 写入失败时降级 execCommand 并返回 true", async () => {
    const write = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { write },
      configurable: true,
    });
    vi.stubGlobal("ClipboardItem", class {});
    const exec = vi.fn(() => true);
    document.execCommand = exec as unknown as typeof document.execCommand;

    const ok = await copyRichText(HTML, "hello");
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("无 Clipboard API 时走 execCommand 兜底", async () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec as unknown as typeof document.execCommand;
    const ok = await copyRichText(HTML, "hello");
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("execCommand 也失败时返回 false", async () => {
    const exec = vi.fn(() => false);
    document.execCommand = exec as unknown as typeof document.execCommand;
    const ok = await copyRichText(HTML, "hello");
    expect(ok).toBe(false);
  });

  it("execCommand 抛异常时返回 false 且不外泄", async () => {
    const exec = vi.fn(() => {
      throw new Error("not implemented");
    });
    document.execCommand = exec as unknown as typeof document.execCommand;
    await expect(copyRichText(HTML, "hello")).resolves.toBe(false);
  });
});
