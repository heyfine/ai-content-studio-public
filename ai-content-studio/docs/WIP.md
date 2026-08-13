# 当前进度与下一步

## 进行中

### Bug 修复：EditorToolbar 按钮点击无效（2026-07-09）
**问题**：EditorToolbar 工具栏的块级按钮（标题、列表、表格、代码块）点击后无反应。B I S U 和图片按钮可用。
**根因**：鼠标事件传播到父容器，导致编辑器焦点丢失。当命令执行时，ProseMirror 没有焦点，因此变更不显示。
**修复**：
1. 新增 `focusEditor()` 函数，直接操作 DOM 聚焦 `.ProseMirror` 元素
2. 所有按钮添加 `onMouseDown={(e) => e.stopPropagation()}`，阻止事件冒泡到父容器
3. 直接调用 `commands.xxx()` 而非 chain（避免重复 focus）
**文件**：`src/lib/editor/components/editor-toolbar.tsx`
**测试结果**：全部通过（6 tests passed，typecheck 无报错）

### 下一步
- [ ] 验证实际浏览器中所有按钮功能正常

## 已完成

### 多 AI 协作规范建立
- 读取 AGENTS.md
- 了解项目文档体系
- 建立 WIP/ROADMAP/TODO 工作流
