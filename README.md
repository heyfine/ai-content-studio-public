# AI Content Studio

个人 AI 内容生产工作台：选题 → AI 写作 → 人工编辑 → SEO → 发布 WordPress → 数据分析 → 内容迭代，形成闭环。定位为「个人版 Jasper + Notion AI + WordPress CMS + OpenRouter 管理平台」。

## 现状

- Phase 1 基线已完成：可运行空壳后台 + 登录认证闭环。
- Phase 2 已完成：AI 供应商管理、模型路由、统一 `AI.generate()` 调用层；数据库已迁移 + 种子管理员就绪，端到端登录链路验证通过。
- Phase 3 进行中：内容生产闭环已打通 Prompt 管理 → 文章状态机 → AI Studio 三栏 → AI 流式生成 + Prompt 模板注入 → Markdown 编辑器 → 文章保存与状态流转 UI；typecheck/test/build 全绿，覆盖率 ≥80%。
- 完整规划见 `AI Content Studio项目.txt` 与 `docs/ROADMAP.md`。

## 技术栈

| 项 | 选型 |
| --- | --- |
| 运行时 | Node.js ≥ 24 |
| 语言 | TypeScript |
| 框架 | Next.js 16（App Router + Turbopack） |
| UI | Tailwind CSS v4 + shadcn/ui（base-nova，基于 @base-ui/react） |
| 状态 | Zustand（Studio 跨面板共享） |
| 表单 | React Hook Form + Zod 4 |
| 数据库 | PostgreSQL（Supabase） + Prisma 6 |
| 认证 | Auth.js v5（JWT + Credentials） |
| 测试 | Vitest 4 + Testing Library + msw |
| 代码质量 | Biome 2（格式化）+ ESLint + tsc |
| 包管理 | pnpm 11 |

## 常用命令

> Windows PowerShell 执行策略会拦截 `pnpm` 脚本，统一用 `pnpm.cmd`；或改用 Git Bash 直接 `pnpm`。

```bash
cd ai-content-studio
pnpm.cmd install         # 安装依赖
pnpm.cmd dev             # 本地开发（Turbopack）
pnpm.cmd build           # 生产构建
pnpm.cmd typecheck       # 类型检查（tsc --noEmit）
pnpm.cmd test            # 运行测试
pnpm.cmd run test:coverage  # 覆盖率（阈值 80%）
pnpm.cmd run format      # Biome 格式化
pnpm.cmd run db:generate # 生成 Prisma Client
pnpm.cmd run db:migrate  # 执行迁移（需 DATABASE_URL）
pnpm.cmd run db:seed     # 种子管理员（需 ADMIN_EMAIL/ADMIN_PASSWORD）
```

## 目录结构

```
AI Content Studio gml/
├── AGENTS.md            AI 行为准则（覆盖全树）
├── README.md            本文件
├── docs/                文档体系（PROJECT_MEMORY / ROADMAP / WIP …）
├── AI Content Studio项目.txt   原始产品设计全文
└── ai-content-studio/   Next.js 代码根
    ├── src/app/         路由：(auth)/login、(dashboard)/*、api/auth|providers|task-routes|ai/generate
    ├── src/components/  layout / ui / providers / settings / studio
    ├── src/lib/         auth / prisma / crypto / credentials / auth-schema
    │                    / ai（adapters/router/generate）/ services / schemas
    ├── src/config/      nav 菜单 + task-routes 任务定义
    ├── prisma/          schema.prisma（User + AIProvider/AIModel/AITaskRoute/Prompt/AIGeneration）
    ├── middleware.ts    路由保护
    ├── vitest.config.ts / biome.json
    └── scripts/seed-admin.ts
```

## 环境变量

复制 `ai-content-studio/.env.example` 为 `.env.local` 填写（勿提交）：

| 变量 | 用途 | 必填 |
| --- | --- | --- |
| `DATABASE_URL` | 本地 PostgreSQL 连接串（库 `acs`，账号 `acs_app`，见 PROJECT_MEMORY §2） | 是 |
| `AUTH_SECRET` | Auth.js 加密密钥 | 是 |
| `AUTH_TRUST_HOST` | 信任主机头 | 是 |
| `ENCRYPTION_KEY` | API Key AES-256-GCM 加密密钥 | 是（AI 供应商功能） |
| `ADMIN_EMAIL` | 种子管理员邮箱 | 运行 db:seed 时 |
| `ADMIN_PASSWORD` | 种子管理员密码 | 运行 db:seed 时 |

> ⚠️ `.env` / `.env.local` 不提交，AI 不直接读取；脚本由你本地运行（见 AGENTS.md 安全条款）。

## 部署

- 平台规划：Vercel（前端）+ 数据库（本地 PostgreSQL `acs`，与 ERP 共用本机 PG17 实例）+ Oracle 服务器（WordPress）
- 详细步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## AI 接手指南

1. [AGENTS.md](AGENTS.md)（行为约定）→ [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md)（环境/踩坑/决策）→ [docs/WIP.md](docs/WIP.md)（当前进度）
2. 需要理解来龙去脉再读 [docs/BUILD_LOG.md](docs/BUILD_LOG.md)
3. 代码在 `ai-content-studio/`，所有命令在该目录执行

## 更新规则

- 技术栈 / 常用命令 / 目录结构 / 环境变量 / 部署信息变化时 → 同步更新本文件
