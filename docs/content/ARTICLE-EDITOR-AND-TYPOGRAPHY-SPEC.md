# AI Content Studio 文章编辑与排版规范

> 版本：v1.0
>
> 目标：在不改变文章事实和正文结构的前提下，提供可控、可预览、可发布的语义化排版模块。

## 1. 第一版目标与边界

第一版只实现人工可控的「高亮块（Callout）」：

- 用户主动插入高亮块并选择语义类型；
- 编辑器中显示颜色、图标和标题；
- 保存后的内容在 WordPress 发布后保持相同语义和视觉风格；
- 高亮块内容由用户编辑，AI 不得未经确认自动插入或改写；
- 不把整篇文章立即迁移为完整 Block JSON，不影响现有 Markdown/HTML 文章。

后续可增加 AI 建议、引用块、代码块、图片、表格和目录等模块，但必须保持向后兼容。

## 2. 高亮块的语义类型

颜色不是自由装饰，而是表达内容语义。第一版固定以下 7 种类型：

| 类型 | 颜色 | 默认图标 | 用途 |
| --- | --- | --- | --- |
| `info` | 蓝色 | ℹ️ | 客观信息、背景资料、来源说明 |
| `tip` | 绿色 | 💡 | 推荐、技巧、使用建议 |
| `warning` | 橙色 | ⚠️ | 注意事项、限制条件、待确认信息 |
| `danger` | 红色 | ⛔ | 风险、错误、严重警告 |
| `note` | 黄色 | 📝 | 重点提醒、补充提示 |
| `insight` | 紫色 | 🔎 | 深度观点、分析洞察、作者判断 |
| `neutral` | 灰色 | 📌 | 普通补充说明，不带明显倾向 |

类型名称、颜色和图标应集中定义为共享配置。编辑器预览和 WordPress CSS 不得分别维护另一套含义。

## 3. 内容表示格式

第一版沿用现有 Markdown/HTML 内容，使用 fenced directive 表示高亮块：

```md
:::callout{type="warning" title="注意" icon="⚠️"}
目前这些信息来自第三方爆料，并非官方确认。
:::
```

### 3.1 字段规则

- `type` 必填，只允许上表中的 7 个值；未知值按 `neutral` 处理，不得导致整篇文章渲染失败；
- `title` 可选。省略时使用该类型的默认中文名称；
- `icon` 可选。省略时使用该类型的默认图标；图标只能是短文本/Emoji，不允许注入 HTML；
- 内容支持普通段落、加粗、链接等现有安全 Markdown；不得在高亮块中嵌套另一个 `callout`；
- 内容为空时仍可编辑，但发布前应提示用户补充或删除该块；
- `:::` 闭合标记必须成对出现。未闭合或非法结构按普通文本保留，不能吞掉后续文章内容。

### 3.2 向后兼容

- 旧文章不包含 `:::callout` 时，渲染结果必须与当前一致；
- 保存文章时只新增高亮块语法，不重写用户未修改的正文；
- WordPress 发布失败不能破坏本地文章内容；
- 禁止把用户输入未经清理地拼入 HTML 属性或标签，防止 XSS。

## 4. 编辑器交互

### 4.1 插入流程

1. 用户把光标放在正文位置，点击工具栏「高亮块」；
2. 弹出类型选择：信息、推荐、注意、警告、提醒、洞察、补充；
3. 在光标位置插入对应模板；
4. 用户编辑标题和内容；
5. 预览区实时显示最终颜色和图标；
6. 用户可以修改类型、编辑内容或删除整个高亮块。

插入模板示例：

```md
:::callout{type="info" title="信息" icon="ℹ️"}
在这里输入需要展示的信息。
:::
```

### 4.2 可见性与可控性

- 编辑状态下必须能看出高亮块的边界和类型；
- 类型切换只修改块属性，不改动块内正文；
- 删除前应提供撤销能力或依赖编辑器已有撤销机制；
- 不因文章过长而限制高亮块数量，但不建议连续堆叠多个相同类型块；
- 移动端保证内容可读，不要求固定宽度布局。

## 5. 编辑器与 WordPress 渲染

### 5.1 统一 DOM 结构

编辑器预览与发布转换应生成等价结构：

```html
<aside class="callout callout-warning">
  <div class="callout-title"><span aria-hidden="true">⚠️</span> 注意</div>
  <div class="callout-content"><p>目前这些信息来自第三方爆料，并非官方确认。</p></div>
</aside>
```

- `type` 只进入经过白名单校验的 class token；
- `title`、`icon` 和正文必须经过现有 Markdown/HTML 安全处理；
- 图标使用 `aria-hidden="true"`，标题文字承担实际可访问语义；
- 高亮块不能只依赖颜色表达含义，必须同时显示标题/图标。

### 5.2 设计 Token

类型颜色集中定义 CSS 变量或 Tailwind 主题 token，例如：

```css
.callout-info { --callout-bg: #eff6ff; --callout-border: #60a5fa; --callout-text: #1e40af; }
.callout-tip { --callout-bg: #f0fdf4; --callout-border: #4ade80; --callout-text: #166534; }
.callout-warning { --callout-bg: #fff7ed; --callout-border: #fb923c; --callout-text: #9a3412; }
.callout-danger { --callout-bg: #fef2f2; --callout-border: #f87171; --callout-text: #991b1b; }
.callout-note { --callout-bg: #fefce8; --callout-border: #facc15; --callout-text: #854d0e; }
.callout-insight { --callout-bg: #faf5ff; --callout-border: #c084fc; --callout-text: #6b21a8; }
.callout-neutral { --callout-bg: #f8fafc; --callout-border: #cbd5e1; --callout-text: #475569; }
```

实际颜色需同时满足浅色背景下的文字对比度要求；深色主题和 WordPress 主题应提供对应覆盖。

## 6. 发布规则

- 发布前将 directive 解析为安全 HTML；不把原始 `:::callout` 语法直接发到 WordPress；
- 仅允许白名单类型、属性和标签；未知类型降级为 `neutral`；
- 解析器必须有纯函数测试，至少覆盖：7 种类型、默认标题/图标、非法类型、未闭合块、XSS 字符串、旧文章无块；
- 编辑器预览和发布转换应使用同一类型配置，避免本地看到蓝色、博客显示成另一种颜色；
- WordPress 发布接口失败时保留原始文章，不自动回写损坏内容。

## 7. AI 辅助建议（后续版本）

AI 可以分析文章并返回建议，不直接修改正文：

```json
{
  "start": 120,
  "end": 188,
  "type": "warning",
  "title": "注意",
  "reason": "该段内容来自未经官方确认的第三方信息",
  "replacement": "..."
}
```

规则：

- 建议必须标明原文范围、建议类型和理由；
- 用户确认后才插入或修改；
- AI 不得因为关键词（如「注意」「推荐」）就无条件插入高亮块；
- 事实判断、来源判断仍需用户审核；
- AI 建议失败或格式异常时不影响原文编辑。

## 8. 验收标准

- 用户可以在光标位置插入、编辑、切换和删除 7 种高亮块；
- 编辑器实时预览颜色、图标和标题；
- 保存、重新打开、发布到 WordPress 后结构和语义一致；
- 旧文章渲染不变化；
- 非法输入不会导致 XSS、页面崩溃或吞掉后续正文；
- 长文章中高亮块仍可滚动、编辑和发布；
- AI 仅提供可确认的建议，不在后台静默修改文章。
