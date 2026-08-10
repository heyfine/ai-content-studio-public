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
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  appendMessage: (m: ChatMessage) => void;
  appendDelta: (id: string, delta: string) => void;
  clearMessages: () => void;
  setSelectedTask: (t: string) => void;
  setSelectedPromptId: (id: string | null) => void;
  setGenerating: (b: boolean) => void;
  setError: (e: string | null) => void;
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
}));
