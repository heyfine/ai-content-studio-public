# {{项目名}}

<!-- 模板说明：替换所有 {{占位符}}；删除不适用小节。 -->

{{一句话项目简介：做什么的，解决什么问题}}

## 常用命令

```bash
pnpm install         # 安装依赖
pnpm dev             # 本地开发
pnpm build           # 生产构建
pnpm typecheck       # 类型检查
pnpm lint            # lint 检查
pnpm test            # 运行测试
pnpm run format      # 格式化代码
```

## 目录结构

<!-- 按实际项目列出，示例： -->

```
src/                 源码
  components/        组件
  lib/               数据层 / 工具
  app/               页面路由
scripts/             脚本（发布 / 数据同步等）
docs/                项目文档
deploy/              部署配置 / 环境脚本
```

## 环境变量

<!-- 列出所有环境变量（名称、用途、是否必填、示例），注意不要出现真实密钥： -->

| 变量 | 用途 | 必填 | 示例 |
| --- | --- | --- | --- |
| `{{VARIABLE_NAME}}` | {{用途}} | 是/否 | {{示例值}} |

复制 `.env.example` 为 `.env.local` 填写。

## 部署

- 部署平台：{{Vercel / Docker / 自建…}}
- 地址：{{线上地址}}
- 详细步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## AI 接手指南

1. 先读 [AGENTS.md](AGENTS.md)（行为约定）→ [docs/WIP.md](docs/WIP.md)（当前进度）→ [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md)（环境/架构/踩坑）
2. 需要理解来龙去脉再读 [docs/BUILD_LOG.md](docs/BUILD_LOG.md)

## 更新规则

- 项目名 / 简介 / 常用命令 / 目录结构 / 环境变量 / 部署地址发生变化时 → 同步更新本文件
