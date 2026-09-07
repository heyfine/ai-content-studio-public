#!/bin/sh
# AI Content Studio 容器入口：
# 1. public/uploads 是运行期图片库，可能被挂载卷覆盖（卷初始属主为 root）
# 2. 以 root 起步创建目录并 chown 给 node 用户，再降权执行主进程（node server.js）
set -e

mkdir -p /app/public/uploads
chown -R node:node /app/public/uploads 2>/dev/null || true

exec su-exec node:node "$@"
