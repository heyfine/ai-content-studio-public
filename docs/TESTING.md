# 测试指南

## 如何运行测试

```bash
cd ai-content-studio
pnpm.cmd test             # 跑全部测试
pnpm.cmd run test:watch   # 监听模式
pnpm.cmd test src/lib/credentials.test.ts   # 只跑某个文件
pnpm.cmd run test:coverage   # 覆盖率
```

## 覆盖率要求

- 核心逻辑（lib / config / 组件）覆盖率阈值：行/分支/函数/语句 ≥ 80%
- 当前：Stmts 93.67 / Branch 88.23 / Funcs 85.71 / Lines 93.58（Phase 1）
- 不足时 CI 会失败；关键路径必测

## 测试类型

| 类型 | 说明 | 位置 |
| --- | --- | --- |
| 单元 | 纯逻辑（schema / credentials / prisma lazy / auth.config） | src/lib/*.test.ts、src/auth.config.test.ts |
| 组件 | 布局/误句组件行为 | src/components/layout/*.test.tsx |
| 集成 | 登录表单端到端（成功/失败两条路径） | src/app/(auth)/login/*.test.tsx |

## 写测试的约定

- 组件测试用 `@testing-library/react`，优先测行为（点击、输入、结果）而非实现细节
- 数据层 mock：`vi.mock("@/lib/prisma", ...)`；认证回调用 `vi.hoisted` 创建 mock 再 `vi.mock`（Vitest 4 hoisting 限制）
- 不连真实 Supabase；外部 API 用 mock
- 修 bug 必加可稳定复现的回归用例
- 测试文件与被测代码同目录（`xxx.test.ts`）
- 覆盖率排除：components/ui（shadcn 生成）、config、app layout/page、types、test setup

## 常用技巧

- mock next/navigation：setup.tsx 已全局 mock；测试内可 `vi.mock` 覆盖 usePathname 控制路由
- mock next-auth/react：用 `vi.hoisted` 注入 signIn/signOut
- async server component 测试：`render(await Component())`（需 mock其 server 依赖如 auth）

## 更新规则

- 测试命令 / 覆盖率要求 / 约定变化时同步更新
- 新增好用模式记入「常用技巧」
