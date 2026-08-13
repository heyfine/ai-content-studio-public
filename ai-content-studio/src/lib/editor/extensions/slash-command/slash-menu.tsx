"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { CalloutType } from "@/lib/content/callout-types";

/** slash 菜单可插入块项 */
export interface SlashItem {
  type:
    | "paragraph"
    | "heading"
    | "callout"
    | "bulletList"
    | "orderedList"
    | "taskList"
    | "table"
    | "image"
    | "codeBlock"
    | "horizontalRule";
  label: string;
  description: string;
  icon: string;
  level?: 1 | 2 | 3;
  calloutType?: CalloutType;
}

export interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuRef {
  onDown: () => void;
  onUp: () => void;
  onEnter: () => void;
}

/**
 * slash 命令下拉菜单（ReactRenderer 渲染，v3 props.mount 托管定位）。
 * 键盘：↑/↓ 移动、Enter 选择、Esc 关闭。
 */
export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(
  function SlashMenu({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onDown: () =>
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1)),
      onUp: () =>
        setSelectedIndex((i) =>
          i <= 0 ? Math.max(items.length - 1, 0) : i - 1,
        ),
      onEnter: () => {
        const item = items[selectedIndex];
        if (item) command(item);
      },
    }));

    return (
      <div
        className="z-50 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        role="listbox"
        aria-label="插入块"
        data-testid="slash-menu"
      >
        <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
          插入块
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            无匹配结果
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto p-1">
            {items.map((item, index) => (
              <li key={`${item.type}-${item.calloutType ?? item.level ?? ""}`}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    index === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : ""
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => command(item)}
                  role="option"
                  aria-selected={index === selectedIndex}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
