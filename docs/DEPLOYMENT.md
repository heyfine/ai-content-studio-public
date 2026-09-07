# 部署指南

## 部署目标

- 平台：Vercel（前端）+ Supabase（PostgreSQL）+ Oracle 服务器（WordPress）
- 线上地址（规划）：ai.ggmm.cc.cd
- 环境：Node.js ≥ 24
- 另有 **Docker 自托管**部署方式（推荐个人 VPS 一键起，见文末「Docker 部署」）

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

## Docker 部署（自托管，推荐 VPS 一键起）

> 镜像与编排都在 `ai-content-studio/` 内：`Dockerfile`（多阶段）+ `docker-compose.yml` + `.env.docker.example`。
> 与 Vercel 方式互斥二选一；Docker 方式自带 PostgreSQL 容器，不依赖外部数据库。

### 架构

三个服务由 compose 编排，启动顺序自动保证：`db`（健康检查）→ `migrate`（一次性初始化）→ `app`。

| 服务 | 镜像 | 说明 |
| --- | --- | --- |
| `db` | postgres:17-alpine | 本地 PostgreSQL，数据在 `dbdata` 卷 |
| `migrate` | 本项目 `migrator` target | 一次性：`prisma db push` + `seed-admin`（管理员）+ `seed-prompts`（Prompt 模板），成功即退出 |
| `app` | 本项目 `runner` target | Next.js standalone 运行（node server.js），端口 3000 |

镜像构建阶段：`deps`（pnpm install 全量依赖）→ `builder`（prisma generate + `next build`，standalone 输出）→ `runner`（瘦镜像：仅 standalone + static + public + prisma client）。

### 快速开始

```bash
cd ai-content-studio
cp .env.docker.example .env.docker
# 编辑 .env.docker：至少改 POSTGRES_PASSWORD / AUTH_SECRET / ENCRYPTION_KEY / ADMIN_EMAIL / ADMIN_PASSWORD
docker compose --env-file .env.docker up -d --build
# 首次会构建镜像并启动 db → migrate → app，等待健康检查通过
docker compose --env-file .env.docker ps        # app 状态 healthy
# 浏览器打开 http://localhost:3000，用 ADMIN_EMAIL/ADMIN_PASSWORD 登录
```

> `--env-file .env.docker` 同时承担 compose 变量插值（`POSTGRES_PASSWORD` 构造 `DATABASE_URL`）与容器环境注入。

### 环境变量（.env.docker）

| 变量 | 说明 |
| --- | --- |
| `POSTGRES_PASSWORD` | db 容器密码（必改，强随机） |
| `AUTH_SECRET` | Auth.js 加密密钥，`openssl rand -base64 32`（必改；**升级镜像时保持不变**，否则已登录会话全部失效） |
| `ENCRYPTION_KEY` | AI Key 加密密钥 32 字节 base64（必改；**保持不变**，否则已存 AIProvider/WeChat/Relay 密钥无法解密） |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | migrate 服务幂等创建/更新的管理员账号（登录用，建议部署后到库里改密） |
| `APP_PORT` | 应用对外端口（默认 3000） |

### 数据持久化

- `dbdata` 卷：PostgreSQL 数据（删除容器不丢）
- `uploads` 卷：运行期图片库 `public/uploads/`（编辑器粘贴上传/图片库/外部图转存），挂载在 `/app/public/uploads`
- 备份：`docker compose --env-file .env.docker exec db pg_dump -U acs_app acs > acs-backup.sql`；图片卷 `docker run --rm -v acs_uploads:/data -v $PWD:/backup alpine tar czf /backup/uploads.tgz -C /data .`

### 升级 / 重建

```bash
git pull
docker compose --env-file .env.docker up -d --build   # 重新构建镜像并滚动重建 app
```

- migrate 服务在每次 `up` 时都会重跑（db push 幂等、seed 幂等），schema 变更自动应用
- 构建与运行期的 `AUTH_SECRET`/`ENCRYPTION_KEY` 必须沿用，否则登录态/存量密钥失效

### 反向代理（HTTPS，可选）

应用只监听 3000；生产建议在前面加 Caddy/Nginx 终结 HTTPS。Caddy 示例：

```
ai.ggmm.cc.cd {
    reverse_proxy 127.0.0.1:3000
}
```

### 常见问题

- **Prisma engine 缺失**：runner 镜像显式复制了 `node_modules/.prisma`（standalone 追踪不保证二进制），并安装 openssl（library engine 动态链接 libssl3）；升级 Prisma 大版本后重构建验证。
- **图片不显示/无法上传**：检查 `uploads` 卷是否挂载、目录权限（entrypoint 已 chown 给 node 用户）。
- **构建需联网**：pnpm install / prisma engine 下载 / npm 源都需外网；本机构建可配 `pnpm config set store-dir` 复用缓存。
- **构建期不连数据库**：页面数据全走 client + API，`next build` 无需 DATABASE_URL；builder 阶段仅注入占位 AUTH_SECRET 供 auth() 初始化。

## 更新规则

- 部署流程 / 环境变量 / 平台配置 / 回滚方式变化时同步更新
