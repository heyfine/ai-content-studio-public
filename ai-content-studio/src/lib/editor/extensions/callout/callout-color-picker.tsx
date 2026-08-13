"use client";

/** 高亮块文字/边框/填充颜色调色板 */

export const CALLCOLOR_PALETTE = [
  "#1f2937", "#374151", "#6b7280", "#9ca3af", "#e5e7eb", "#ffffff",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
];

export interface CalloutColorPickerProps {
  /** 当前值（空串表示未自定义，走类型默认色） */
  value: string;
  onPick: (color: string) => void;
  onClear: () => void;
}

/** 预设色板 + 自定义取色器 + 恢复默认 */
export function CalloutColorPicker({ value, onPick, onClear }: CalloutColorPickerProps) {
  const normalized = value.toLowerCase();
  return (
    <div className="callout-color-panel" role="dialog" aria-label="选择颜色">
      <div className="callout-color-grid">
        {CALLCOLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={normalized === c.toLowerCase() ? "active" : ""}
            style={{ background: c }}
            onClick={() => onPick(c)}
            aria-label={`颜色 ${c}`}
          />
        ))}
      </div>
      <div className="callout-color-custom">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3b82f6"}
          onChange={(e) => onPick(e.target.value)}
          aria-label="自定义颜色"
        />
        <span className="callout-color-hex">
          {value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : "自定义…"}
        </span>
        <button type="button" onClick={onClear}>
          默认
        </button>
      </div>
    </div>
  );
}
