import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  task?: string;
}

export interface StudioState {
  title: string;
  content: string;
  messages: ChatMessage[];
  selectedTask: string;
  selectedPromptId: string | null;
  isGenerating: boolean;
  error: string | null;
  /** 当前编辑文章的数据库 id；为空表示未保存（新建中） */
  articleId: string | null;
  /** 当前编辑文章的状态，null 表示未保存 */
  articleStatus: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED" | null;
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  appendMessage: (m: ChatMessage) => void;
  appendDelta: (id: string, delta: string) => void;
  clearMessages: () => void;
  setSelectedTask: (t: string) => void;
  setSelectedPromptId: (id: string | null) => void;
  setGenerating: (b: boolean) => void;
  setError: (e: string | null) => void;
  /** 设置已保存文章的 id 与状态（保存/状态切换成功后调用） */
  setSavedArticle: (id: string, status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED") => void;
  setArticleStatus: (status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED") => void;
  /** 新建/清空当前文章，回到未保存态 */
  resetArticle: () => void;
}

let idSeq = 0;
export function nextId(): string {
  idSeq += 1;
  return `m${idSeq}`;
}

export const useStudioStore = create<StudioState>((set) => ({
  title: "",
  content: "",
  messages: [],
  selectedTask: "article_generate",
  selectedPromptId: null,
  isGenerating: false,
  error: null,
  articleId: null,
  articleStatus: null,
  setTitle: (v) => set({ title: v }),
  setContent: (v) => set({ content: v }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  appendDelta: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
  setSelectedTask: (t) => set({ selectedTask: t }),
  setSelectedPromptId: (id) => set({ selectedPromptId: id }),
  setGenerating: (b) => set({ isGenerating: b }),
  setError: (e) => set({ error: e }),
  setSavedArticle: (id, status) => set({ articleId: id, articleStatus: status }),
  setArticleStatus: (status) => set({ articleStatus: status }),
  resetArticle: () => set({ articleId: null, articleStatus: null }),
}));
