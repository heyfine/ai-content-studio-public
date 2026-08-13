# 当前进度与下一步

## 进行中

### Bug 修复：EditorToolbar 按钮点击无效（2026-07-09）
**问题**：EditorToolbar 工具栏的按钮点击后无反应，只有 B I S U 和图片按钮可用。
**根因**：Tiptap 3.x 的 `chain().focus()` 在某些情况下无法正确触发编辑器焦点，导致块级命令（标题、列表、表格、代码块）不执行。
**修复**：在点击按钮时，先直接操作 DOM 聚焦 `.ProseMirror` 元素（`focusEditor` 函数），再执行链式命令。这确保了命令执行时编辑器已处于焦点状态。
**文件**：`src/lib/editor/components/editor-toolbar.tsx`
**测试结果**：全部通过（6 tests passed，typecheck 无报错）

### 下一步
- [ ] 验证实际浏览器中所有按钮功能正常

## 已完成

### 多 AI 协作规范建立
- 读取 AGENTS.md
- 了解项目文档体系
- 建立 WIP/ROADMAP/TODO 工作流
