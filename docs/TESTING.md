# TESTING · AI Content Studio 测试指南

## 环境要求

- Node.js ≥ 24
- pnpm ≥ 11
- DATABASE_URL（.env.local）— 开发/测试环境必须配置，否则 API 测试会失败
- Prisma Client 已生成：`pnpm.cmd run db:generate`

## 常用命令

```bash
# 运行全部测试
pnpm.cmd test

# 运行指定目录的测试
pnpm.cmd exec vitest run src/lib/content/

# 运行单个测试文件
pnpm.cmd exec vitest run src/lib/content/render.test.ts

# 运行带覆盖率
pnpm.cmd run test:coverage

# 类型检查
pnpm.cmd typecheck

# 格式化 + lint
pnpm.cmd run format
pnpm.cmd exec biome check .
```

## 测试覆盖说明

| 模块 | 文件数 | 测试数 | 备注 |
| --- | --- | --- | --- |
| API 路由 | 22 | ~180 | 全量 auth+zod+错误处理 |
| Service 层 | 10 | ~90 | 含 mock prisma/fetch |
| UI 组件 | 15 | ~150 | jsdom + Testing Library |
| 工具函数 | 5 | ~60 | 纯逻辑 100% 可测 |
| Store | 2 | ~20 | Zustand persist 测试 |
| **总计** | **82** | **588** | **Phase 10 后** |

## 覆盖率目标

- Statements ≥ 80%
- Branches ≥ 70%
- Functions ≥ 80%
- Lines ≥ 80%

## 已知测试注意事项

1. **Vitest 4 ESM mock hoisting**：`vi.mock` 必须在模块顶层，使用 `vi.hoisted()` 避免 ReferenceError
2. **base-ui Select jsdom**：部分 Select 组件在 jsdom 无法正确模拟 pointer/portal，需要 mock 为原生 `<select>`
3. **Base UI Dialog/Select 在 jsdom 的行为**：某些 base-ui 组件（Select、Dialog）依赖 pointer/portal 定位，jsdom 环境下 fireEvent.click 可能不触发预期行为。解决方案是 mock 这些组件为原生 HTML 元素，或直接用 `vi.mock` 替换为简化版本
4. **Vitest 4 effect 中 fetch 作为 promise**：useEffect 里的 `void refresh()` 如果包含 fetch，测试中需要用 `mockRejectedValue` 而非 `mockResolvedValue` 来模拟失败路径
5. **Prisma Json 字段写入**：直接写 `InputJsonValue` 类型需要 `JSON.parse(JSON.stringify(arr))` 转换以绕过 TS 索引签名限制
6. **zustand persist 存储格式**：persist 写入 localStorage 的格式为 `{ state: {...partialize}, version: 0 }`，测试 rehydrate 时需要手动构造此格式

## Phase 10 新增测试

- `render.test.ts`：findCalloutRanges(3) / editCalloutInMarkdown(5) / removeCalloutInMarkdown(3) / XSS 修复(1)
- `article-editor-dialog.test.tsx`：管理面板显示(1) / 列表渲染(1) / 编辑回写(1) / 删除(1)
