"use client";

import { useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";

import { CALLOUT_TYPES, type CalloutType, isCalloutType } from "@/lib/content/callout-types";

/** 常用可换图标（Emoji/符号），点图标弹出选择 */
const CALLOUT_EMOJIS = [
  "💡", "ℹ️", "📌", "⭐", "🔥", "✅", "⚠️", "⛔",
  "📝", "🔎", "💬", "🎯", "❤️", "👍", "👀", "🕐",
  "💰", "🚀", "🧠", "📚", "🎨", "🔔", "💎", "🔑",
  "🛡️", "💊", "🧪", "📈", "🌱", "🌍", "☀️", "🌈",
  "🎉", "🍀", "📣", "🕯️", "🧭", "🗺️", "✏️", "❗",
];

/**
 * Callout 块的 React NodeView —— 编辑器内就地渲染。
 *
 * 关键点：
 * - data-drag-handle 是 ProseMirror 约定，mousedown 触发整 Node selection + drag
 * - <select>/<button>/标题行加 contentEditable={false}，防表单元素卷入 ProseMirror 输入
 * - 图标可点击更换：弹出 Emoji 选择面板（自定义输入兜底），对应 attrs.icon
 * - 正文由 NodeView 自动注入 contentEditable，不手写 <div contentEditable>
 */
export function CalloutView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const rawType = (node.attrs.type as string) ?? "";
  const type: CalloutType = isCalloutType(rawType) ? rawType : "neutral";
  const cfg = CALLOUT_TYPES.find((c) => c.type === type) ?? CALLOUT_TYPES[0];
  const title = (node.attrs.title as string) ?? "";
  const icon = (node.attrs.icon as string) ?? "";
  const [iconOpen, setIconOpen] = useState(false);

  return (
    <NodeViewWrapper
      as="aside"
      className={`callout callout-${cfg.type}`}
      data-selected={selected ? "true" : undefined}
    >
      <span
        data-drag-handle
        aria-hidden="true"
        className="callout-handle"
        style={{ cursor: "grab", userSelect: "none" }}
        contentEditable={false}
      >
        ⋮⋮
      </span>
      <div className="callout-title" contentEditable={false}>
        <div className="callout-icon" style={{ position: "relative" }}>
          <button
            type="button"
            className="callout-icon-btn"
            onClick={() => setIconOpen((v) => !v)}
            aria-label="更换高亮块图标"
            title="更换图标"
          >
            {icon || cfg.icon}
          </button>
          {iconOpen && (
            <>
              <div className="callout-icon-backdrop" onClick={() => setIconOpen(false)} />
              <div className="callout-icon-panel" role="dialog" aria-label="选择图标">
                <div className="callout-emoji-grid">
                  {CALLOUT_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={icon === e ? "active" : ""}
                      onClick={() => {
                        updateAttributes({ icon: e });
                        setIconOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="callout-icon-custom">
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => updateAttributes({ icon: e.target.value })}
                    placeholder="输入 Emoji 或文字"
                    aria-label="自定义图标"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      updateAttributes({ icon: "" });
                      setIconOpen(false);
                    }}
                  >
                    默认
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <input
          type="text"
          value={title}
          placeholder={cfg.label}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          aria-label="高亮块标题"
          style={{ background: "transparent", border: "none", outline: "none" }}
        />
        <select
          value={type}
          onChange={(e) => updateAttributes({ type: e.target.value as CalloutType })}
          aria-label="高亮块类型"
        >
          {CALLOUT_TYPES.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => deleteNode()} aria-label="删除高亮块">
          删除
        </button>
      </div>
      {/* 正文：NodeViewContent 让 ProseMirror 把内容注入到块内 */}
      <NodeViewContent className="callout-content" />
    </NodeViewWrapper>
  );
}
