# Repository Guidelines

## 项目结构与模块组织

Soothsay 是 pnpm 管理的 Vue 3 + TypeScript + Vite 前端和 Hono Node 服务端项目。前端源码位于 `src/`：`bazi/` 负责八字排盘核心逻辑，`persona/` 负责提示词构建，`services/` 封装 API 调用，`storage/` 处理浏览器本地存储，`App.vue` 与 `styles.css` 承载主界面。服务端位于 `server/src/`，包含 `admin/`、`persona/`、`proxy/`、`storage/` 与 `shared/`。测试集中在 `tests/`，静态默认头像和背景在 `public/defaults/`，部署文档在 `docs/`。

## 构建、测试与开发命令

- `pnpm install`：安装依赖，仓库锁定 `pnpm@10.3.0`。
- `pnpm dev`：启动 Vite 前端开发服务器，并代理 `/api` 与 `/uploads` 到本地服务端。
- `pnpm dev:server`：用 `tsx watch` 启动 Hono 服务端。
- `pnpm test`：运行 Vitest 测试套件。
- `pnpm build`：执行前端类型检查、Vite 构建和服务端 TypeScript 构建。
- `pnpm preview` / `pnpm start`：分别预览前端产物、运行 `dist-server/index.js`。

## 编码风格与命名约定

使用严格 TypeScript、ESM 和 ES2022。保持现有 2 空格缩进、单引号和分号风格。变量与函数使用 `camelCase`，类型、接口和 Vue 组件使用 `PascalCase`。优先复用 `@/*` 与 `@server-shared/*` 路径别名。前端样式必须遵循 `docs/DESIGN.md`；新增或调整 UI 时先对照其中的布局、配色、组件状态和响应式约束。关键业务规则可写简短中文注释；不要删除已有注释，不保留无用兼容代码。

## 测试指南

测试框架为 Vitest，文件命名使用 `*.test.ts`，当前测试位于 `tests/bazi-engine.test.ts` 和 `tests/e2e-acceptance.test.ts`。新增排盘、提示词、代理或存储行为时，应补充覆盖正常路径、边界条件和失败路径。涉及环境变量的测试应显式 mock 或设置测试临时值，不要读取本地 `.env`。

## 提交与 Pull Request 规范

Git 历史使用简短祈使句提交，如 `Add README`、`Add demo link`。提交应聚焦单一变更。PR 需说明变更范围、验证命令、关联 issue；UI 变更附截图，配置或部署变更注明新增环境变量和迁移影响。

## 安全与配置提示

不要提交 `.env` 或真实密钥。服务端配置通过 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`SOOTHSAY_DATA_DIR`、`SOOTHSAY_PG_DSN`、`DATABASE_URL` 等环境变量注入。用户模型凭据、命盘和对话记录属于浏览器本地数据；代理接口不得记录 Authorization、请求正文或响应正文。
