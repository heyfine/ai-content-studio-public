# 部署指南

## 部署目标

- 平台：Vercel（前端）+ Supabase（PostgreSQL）+ Oracle 服务器（WordPress）
- 线上地址（规划）：ai.ggmm.cc.cd
- 环境：Node.js ≥ 24

## 环境变量

部署平台配置以下变量（与 `ai-content-studio/.env.example` 对应，值为生产值，勿提交仓库）：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL 连接串 |
| `AUTH_SECRET` | Auth.js 加密密钥（生产用强随机值） |
| `AUTH_TRUST_HOST` | 一般设 true |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 仅本地 db:seed 使用，部署可用 secrets 灌入 |

## 部署流程（规划）

1. 推送代码到 main 分支
2. Vercel 自动构建 `next build --turbopack`
3. 配置环境变量后首次发布
4. 验证：`/login` 可登录 → `/dashboard` 受保护可达

## 回滚

- Vercel 一键回滚上一版本（Production Deployments）

## 运维

- 监控：Vercel Analytics / health check（待接入）
- 备份：Supabase 自动备份 + 手动定期导出
- 依赖更新：pnpm audit 定期

## 上线检查清单

- [ ] 环境变量齐全且为生产值
- [ ] HTTPS 证书正常
- [ ] /login 与 /dashboard 冒烟通过
- [ ] 数据库迁移已执行
- [ ] 种子管理员已创建并改密

## 更新规则

- 部署流程 / 环境变量 / 平台配置 / 回滚方式变化时同步更新
