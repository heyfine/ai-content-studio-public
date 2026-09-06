"use client";

/** WPS 风格调色板：当前色预览 + 标准色网格（10 色系 × 6 深浅，每行 10 色）+ 自定义 */

/** 10 个色系，每系 6 个色阶（浅 → 深） */
const COLOR_SHADES: string[][] = [
  ["#FFFFFF", "#F5F5F5", "#D9D9D9", "#BFBFBF", "#808080", "#000000"],
  ["#FFF1F0", "#FFCCC7", "#FFA39E", "#FF4D4F", "#CF1322", "#820014"],
  ["#FFF7E6", "#FFE7BA", "#FFD591", "#FFA940", "#D46B08", "#873800"],
  ["#FEFFE6", "#FFFFB8", "#FFFB8F", "#FADB14", "#D4B106", "#614700"],
  ["#F6FFED", "#D9F7BE", "#B7EB8F", "#73D13D", "#389E0D", "#135200"],
  ["#E6FFFB", "#B5F5EC", "#87E8DE", "#36CFC9", "#08979C", "#00474F"],
  ["#E6F4FF", "#BAE0FF", "#91CAFF", "#40A9FF", "#096DD9", "#003A8C"],
  ["#F9F0FF", "#EFDBFF", "#D3ADF7", "#9254DE", "#531DAB", "#22075E"],
  ["#FFF0F6", "#FFD6E7", "#FFADD2", "#EB2F96", "#C41D7F", "#780650"],
  ["#FBF5F0", "#EFE3DA", "#D9BFA9", "#8C6D46", "#614C34", "#3E2E20"],
];

/** 转置为 6 行 × 10 列（每行是同深浅档位下各色系） */
const STANDARD_ROWS: string[][] = COLOR_SHADES[0].map((_, shade) =>
  COLOR_SHADES.map((row) => row[shade]),
);

export interface CalloutColorPickerProps {
  /** 当前值（空串表示未自定义，走类型默认色） */
  value: string;
  onPick: (color: string) => void;
  onClear: () => void;
  /**
   * 色块预览模式：fill 时按实际渲染效果（12% 透明度浅色 + 同色细边）显示，
   * 让调色板所见即所得；默认纯色（文字/边框用）。
   */
  mode?: "solid" | "fill";
}

/** WPS 风格调色板：当前色预览 + 标准色 + 自定义 */
export function CalloutColorPicker({
  value,
  onPick,
  onClear,
  mode = "solid",
}: CalloutColorPickerProps) {
  const normalized = value.toLowerCase();
  const current = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";

  return (
    <div className="callout-color-panel wps-palette" role="dialog" aria-label="选择颜色">
      {/* 当前颜色预览（点击清除） */}
      <div className="wps-palette-current">
        <button
          type="button"
          className={`wps-palette-swatch${current ? "" : " empty"}`}
          style={
            current
              ? {
                  background:
                    mode === "fill" ? `color-mix(in oklab, ${current} 12%, transparent)` : current,
                  borderColor: mode === "fill" ? current : undefined,
                }
              : undefined
          }
          onClick={onClear}
          aria-label="清除颜色"
          title="点击清除颜色"
        />
        <span className="wps-palette-hex">{current ? current.toUpperCase() : "无填充"}</span>
      </div>

      {/* 标准色网格 */}
      <div className="wps-palette-grid">
        {STANDARD_ROWS.map((row, ri) => (
          <div key={ri} className="wps-palette-row">
            {row.map((c) => (
              <button
                key={c}
                type="button"
                className={normalized === c.toLowerCase() ? "active" : ""}
                style={
                  mode === "fill"
                    ? {
                        background: `color-mix(in oklab, ${c} 12%, transparent)`,
                        borderColor: c,
                      }
                    : { background: c }
                }
                onClick={() => onPick(c)}
                aria-label={`颜色 ${c}`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 自定义颜色 */}
      <div className="wps-palette-custom">
        <input
          type="color"
          value={current || "#3b82f6"}
          onChange={(e) => onPick(e.target.value)}
          aria-label="自定义颜色"
        />
        <span className="wps-palette-custom-label">自定义</span>
        <button type="button" onClick={onClear}>
          清除
        </button>
      </div>
    </div>
  );
}
