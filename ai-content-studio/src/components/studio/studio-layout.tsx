"use client";

import { AIChatPanel } from "./ai-chat-panel";
import { EditorPanel } from "./editor-panel";
import { StudioSidebar } from "./studio-sidebar";

export function StudioLayout() {
  return (
    <div className="h-full overflow-hidden">
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[280px_1fr_240px]">
        <aside className="hidden min-h-0 border-r lg:block">
          <AIChatPanel />
        </aside>
        <main className="min-h-0 overflow-hidden border-r">
          <EditorPanel />
        </main>
        <aside className="hidden min-h-0 lg:block">
          <StudioSidebar />
        </aside>
      </div>
    </div>
  );
}
