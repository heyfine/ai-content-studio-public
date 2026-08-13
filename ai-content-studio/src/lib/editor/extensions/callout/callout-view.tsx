"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import {
  CALLOUT_TYPES,
  type CalloutType,
  isCalloutType,
} from "@/lib/content/callout-types";

/**
 * Callout 块的 React NodeView —— 编辑器内就地渲染。
 *
 * 关键点：
 * - data-drag-handle 是 ProseMirror 约定，mousedown 触发整 Node selection + drag
 * - <select>/<button>/标题行加 contentEditable={false}，防表单元素卷入 ProseMirror 输入
 * - 正文由 NodeView 自动注入 contentEditable，不手写 <div contentEditable>
 * - 配色复用 CALLOUT_CSS（与 preview/WP 同 token）
 */
export function CalloutView({
  node,
  updateAttributes,
  selected,
  deleteNode,
}: NodeViewProps) {
  const rawType = (node.attrs.type as string) ?? "";
  const type: CalloutType = isCalloutType(rawType) ? rawType : "neutral";
  const cfg = CALLOUT_TYPES.find((c) => c.type === type) ?? CALLOUT_TYPES[0];
  const title = (node.attrs.title as string) ?? "";
  const icon = (node.attrs.icon as string) ?? "";

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
        <span className="callout-icon" aria-hidden="true">
          {icon || cfg.icon}
        </span>
        <input
          type="text"
          value={title}
          placeholder={cfg.label}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          aria-label="高亮块标题"
          style={{ background: "transparent", border: "none", outline: "none" }}
        />
        <input
          type="text"
          value={icon}
          placeholder={cfg.icon}
          onChange={(e) => updateAttributes({ icon: e.target.value })}
          aria-label="高亮块图标"
          style={{ width: "3em", background: "transparent", border: "none", outline: "none" }}
        />
        <select
          value={type}
          onChange={(e) =>
            updateAttributes({ type: e.target.value as CalloutType })
          }
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
      {/* NodeView 自动注入正文 contentEditable 区域，此处留空 */}
    </NodeViewWrapper>
  );
}
