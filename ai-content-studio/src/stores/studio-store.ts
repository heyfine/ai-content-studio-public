import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  task?: string;
}

/** 一次 AI 生成的完整结果（原文与生成内容对比区的条目）。 */
export interface GenerationItem {
  id: string;
  task: string;
  /** 第几次生成（从 1 开始，全局递增） */
  index: number;
  content: string;
  /** 开始生成时间（如 14:32:05），用于展示 */
  createdAt: string;
}

export interface StudioState {
  title: string;
  content: string;
  messages: ChatMessage[];
  generations: GenerationItem[];
  selectedTask: string;
  selectedPromptId: string | null;
  isGenerating: boolean;
  error: string | null;
  /** 当前编辑文章的数据库 id；为空表示未保存（新建中） */
  articleId: string | null;
  /** 深度思考开关（OpenAI o 系列与兼容 reasoning 模型生效） */
  reasoningEnabled: boolean;
  /** 推理强度：低/中/高，reasoningEnabled 为 true 时生效 */
  reasoningEffort: "low" | "medium" | "high";
  /** 当前编辑文章的状态，null 表示未保存 */
  articleStatus: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED" | null;
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  appendMessage: (m: ChatMessage) => void;
  appendDelta: (id: string, delta: string) => void;
  clearMessages: () => void;
  appendGeneration: (item: GenerationItem) => void;
  appendGenerationDelta: (id: string, delta: string) => void;
  clearGenerations: () => void;
  setSelectedTask: (t: string) => void;
  setSelectedPromptId: (id: string | null) => void;
  setReasoningEnabled: (b: boolean) => void;
  setReasoningEffort: (e: "low" | "medium" | "high") => void;
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
  generations: [],
  selectedTask: "article_generate",
  selectedPromptId: null,
  isGenerating: false,
  error: null,
  articleId: null,
  reasoningEnabled: false,
  reasoningEffort: "medium",
  articleStatus: null,
  setTitle: (v) => set({ title: v }),
  setContent: (v) => set({ content: v }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  appendDelta: (id, delta) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
  appendGeneration: (item) => set((s) => ({ generations: [...s.generations, item] })),
  appendGenerationDelta: (id, delta) =>
    set((s) => ({
      generations: s.generations.map((g) =>
        g.id === id ? { ...g, content: g.content + delta } : g,
      ),
    })),
  clearGenerations: () => set({ generations: [] }),
  setSelectedTask: (t) => set({ selectedTask: t }),
  setSelectedPromptId: (id) => set({ selectedPromptId: id }),
  setReasoningEnabled: (b) => set({ reasoningEnabled: b }),
  setReasoningEffort: (e) => set({ reasoningEffort: e }),
  setGenerating: (b) => set({ isGenerating: b }),
  setError: (e) => set({ error: e }),
  setSavedArticle: (id, status) => set({ articleId: id, articleStatus: status }),
  setArticleStatus: (status) => set({ articleStatus: status }),
  resetArticle: () => set({ articleId: null, articleStatus: null }),
}));
