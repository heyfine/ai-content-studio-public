import { beforeEach, describe, expect, it } from "vitest";
import { clearNewArticleDraft, loadNewArticleDraft, saveNewArticleDraft } from "./autosave-draft";

describe("autosave-draft（新建文章本地暂存）", () => {
  beforeEach(() => localStorage.clear());

  it("保存后可读回标题与正文", () => {
    saveNewArticleDraft("暂存标题", "暂存正文");
    const draft = loadNewArticleDraft();
    expect(draft?.title).toBe("暂存标题");
    expect(draft?.content).toBe("暂存正文");
    expect(draft?.savedAt).toBeTruthy();
  });

  it("无暂存时返回 null", () => {
    expect(loadNewArticleDraft()).toBeNull();
  });

  it("损坏的数据返回 null 而非抛错", () => {
    localStorage.setItem("article-new-draft", "{oops");
    expect(loadNewArticleDraft()).toBeNull();
  });

  it("clear 后不再可读", () => {
    saveNewArticleDraft("t", "c");
    clearNewArticleDraft();
    expect(loadNewArticleDraft()).toBeNull();
  });
});
