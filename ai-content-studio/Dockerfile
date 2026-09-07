# syntax=docker/dockerfile:1
# AI Content Studio —— Docker 镜像（多阶段构建）
# 目标：Next.js standalone 瘦镜像 + 一次性迁移/种子镜像（compose 的 migrate 服务）
# 详细部署步骤见 ../docs/DEPLOYMENT.md「Docker 部署」

# ============ 依赖层：安装全部依赖（含 dev，供构建与迁移使用） ============
FROM node:24-alpine AS deps
# 统一时区：调度器/日志/时间戳走北京墙钟（数据库仍存 UTC，仅展示与 cron 语义为本地）
ENV TZ=Asia/Shanghai
WORKDIR /app
# pnpm 固定版本（与 package.json 的 packageManager 一致）
RUN apk add --no-cache tzdata \
    && npm install -g pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ============ 构建层：Prisma Client + Next standalone 构建 ============
FROM node:24-alpine AS builder
ENV TZ=Asia/Shanghai
WORKDIR /app
# 构建期 auth() 需要 AUTH_SECRET 存在；占位值只存在于本阶段，
# 不会进入 runner（运行时密钥由容器环境变量注入，优先级更高）
ENV AUTH_SECRET=build-time-placeholder
ENV AUTH_TRUST_HOST=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 生成 Prisma Client（linux-musl engine，与 runner 平台一致）+ Next standalone 构建
RUN pnpm exec prisma generate \
    && pnpm build

# ============ 运行时层：瘦镜像，仅 standalone 输出 ============
FROM node:24-alpine AS runner
ENV TZ=Asia/Shanghai
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# openssl：Prisma query engine（library 模式）动态链接 libssl3
# su-exec：entrypoint 以 root 起步 chown 上传卷后降权为 node 用户执行
# tzdata：TZ=Asia/Shanghai 生效（北京墙钟）
RUN apk add --no-cache openssl su-exec tzdata
# Next standalone 输出：server.js + 裁剪后的 node_modules（只含运行时依赖）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# public 静态资源（public/uploads 已被 .dockerignore 排除，运行时由挂载卷提供）
COPY --from=builder /app/public ./public
# Prisma Client + query engine：standalone 的 outputFileTracing 不保证追踪二进制，显式复制
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/public/uploads
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]

# ============ 迁移/种子层：一次性 db push + seed（compose 的 migrate 服务） ============
FROM node:24-alpine AS migrator
ENV TZ=Asia/Shanghai
WORKDIR /app
# 完整 node_modules（含 prisma CLI、已生成的 .prisma/client、bcryptjs）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# seed-prompts 依赖 src/lib/ai/prompt-content.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
# 说明：
# - db push 与项目现状一致（schema 变更均走 push 而非 migrate dev，migrations 仅 init）
# - seed-admin 幂等 upsert 管理员（依赖 ADMIN_EMAIL/ADMIN_PASSWORD）
# - seed-prompts 幂等 upsert 写作 Prompt 模板（AI 功能可用性）
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate && node --experimental-transform-types scripts/seed-admin.ts && node --experimental-transform-types scripts/seed-prompts.ts"]
