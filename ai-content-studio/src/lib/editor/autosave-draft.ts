/**
 * 新建文章的本地暂存草稿（localStorage）。
 *
 * 新建文章在标题为空时无法落库（标题必填），退出前把标题/正文暂存到
 * localStorage，下次进入「新建文章」自动恢复；文章成功创建后清除。
 * key 固定单份：新建流程同一时刻只有一份在编辑。
 */
const KEY = "article-new-draft";

export interface NewArticleDraft {
  title: string;
  content: string;
  savedAt: string;
}

export function loadNewArticleDraft(): NewArticleDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as NewArticleDraft;
    if (typeof draft.title !== "string" || typeof draft.content !== "string") return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveNewArticleDraft(title: string, content: string): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        title,
        content,
        savedAt: new Date().toISOString(),
      } satisfies NewArticleDraft),
    );
  } catch {
    // 存储不可用（隐私模式等）则静默放弃，不影响编辑
  }
}

export function clearNewArticleDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}
