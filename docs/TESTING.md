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
- 当前（Phase 3 任务 2 后）：262 测试，Stmts 93.5 / Branch 85.35 / Func 89.1 / Lines 96.16
- 不足时 CI 会失败；关键路径必测

## 测试类型

| 类型 | 说明 | 位置 |
| --- | --- | --- |
| 单元 | 纯逻辑（schema / credentials / crypto / auth.config / router / generate） | src/lib/**/*.test.ts |
| 组件 | 布局/表单/表格行为 | src/components/**/*.test.tsx |
| API 路由 | HTTP 处理层（auth/校验/成功/失败） | src/app/api/**/*.test.ts |
| 集成 | 登录表单端到端（成功/失败两条路径） | src/app/(auth)/login/*.test.tsx |

## 写测试的约定

- 组件测试用 `@testing-library/react`，优先测行为（点击、输入、结果）而非实现细节
- 数据层 mock：`vi.mock("@/lib/prisma", ...)`；认证回调用 `vi.hoisted` 创建 mock 再 `vi.mock`（Vitest 4 hoisting 限制）
- 不连真实 Supabase；外部 AI API 用 mock（不设施网络请求）
- 修 bug 必加可稳定复现的回归用例
- 测试文件与被测代码同目录（`xxx.test.ts`）
- 覆盖率排除：components/ui（shadcn 生成）、config、app layout/page、types、test setup、`lib/auth.ts` 与 `api/auth/**`（NextAuth 胶水代码，全程被 mock）

## 常用技巧

- **API 路由测试**：直接 import handler 函数（`GET`/`POST`/`PUT`/`DELETE`），用 `new Request(url, {method, headers, body})` 构造入参，断言 `res.status` 与 `await res.json()`；mock `@/lib/auth` 与对应 service。带 params 的 handler传 `ctx: { params: Promise.resolve({ id }) }`。
- **状态机 API**：业务层抛 `非法状态转换`/`不存在` 文本错误，路由用正则匹配文本映射 HTTP 状态（404/409）；Prisma P2025（删除不存在记录）也捕获转 404。状态机转换验收用独立可测模块（`article-status.ts` 的 canTransition/assertTransition），不与 DB 耦合。
- **base-ui Select 在 jsdom 中测试**：`vi.mock("@/components/ui/select")` 替换为原生 `<select>`，保持 `value`/`onValueChange` 签名，用 `fireEvent.change` 选值。
- **base-ui Dialog 在 jsdom 中测试**：`vi.mock("@/components/ui/dialog")` 让 `Dialog`/`DialogContent` 直接渲染 children、`DialogTrigger`/`DialogClose` 直接渲染 `render` prop，跳过 portal/可见性，表单内容恒可见可交互。
- **mock next/navigation**：setup.tsx 已全局 mock；测试内可 `vi.mock` 覆盖 usePathname 控制路由
- **mock next-auth/react**：用 `vi.hoisted` 注入 signIn/signOut
- **async server component 测试**：`render(await Component())`（需 mock 其 server 依赖如 auth）
- **window.confirm mock**：删书确认类用 `vi.spyOn(window, "confirm").mockReturnValue(true/false)`
- **effect 触发的 fetch 测试（避免悬空 promise）**：测「加载中」时不要用 `mockReturnValue(new Promise(()=>{}))`（永不 resolve，Vitest 4 判为悬空失败），改用可控 deferred：`let r; fetch.mockReturnValue(new Promise(res => { r = res; })); render(...); 断言; r({ ok:true, json:async()=>[] })`。测「加载失败」时用 `mockResolvedValue({ ok:false })` 让组件内部 throw 并被 try/catch 捕获，避免顶层 rejected promise 被判未捕获拒绝。

## 更新规则

- 测试命令 / 覆盖率要求 / 约定变化时同步更新
- 新增好用模式记入「常用技巧」
