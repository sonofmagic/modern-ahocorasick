---
title: "本地开发文档站"
description: "在仓库工作区运行私有的中英文 VitePress 文档站。"
---

# 本地开发文档站

在仓库工作区运行私有的中英文 VitePress 文档站。

## 环境要求

使用 pnpm 12.5.1，以及符合 `^22.22.1 || ^24.11.0 || >=26.0.0` 的 Node.js。这是仓库工具链要求，不是库的最低浏览器运行要求。TypeScript 保持 6.x，VitePress 使用仓库固定的预发布版本。

## 本地命令

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

开发命令会先构建工作区库包，预览命令在构建后运行。无需后端、账号或部署配置。

## 验证改动

```sh
pnpm build
pnpm exec repo doctor --strict
pnpm exec repo check --full
pnpm lint
pnpm typecheck
pnpm test
pnpm tsd
pnpm test:package
pnpm test:docs:e2e
```

中英文页面、示例与导航需要保持对应。文档改动运行浏览器测试；扫描器或自动机改动还需运行 `pnpm benchmark`。生产部署继续由 CI 检查和 main 分支门禁控制。
