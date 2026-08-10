"use client";

import { AIChatPanel } from "./ai-chat-panel";
import { EditorPanel } from "./editor-panel";
import { StudioSidebar } from "./studio-sidebar";

export function StudioLayout() {
  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[280px_1fr_240px]">
        <aside className="hidden border-r lg:block">
          <AIChatPanel />
        </aside>
        <main className="overflow-hidden border-r">
          <EditorPanel />
        </main>
        <aside className="hidden lg:block">
          <StudioSidebar />
        </aside>
      </div>
    </div>
  );
}
