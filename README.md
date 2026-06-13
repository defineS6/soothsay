# Soothsay

[中文](#中文) · [English](#english)

Demo: [https://soothsay.onrender.com/](https://soothsay.onrender.com/)

---

## 中文

当前版本：`0.2.1`

Soothsay 是一个可自托管的命盘解读应用。它在浏览器本地完成生辰档案、命盘和对话记录管理，通过用户自带的模型凭据调用 LLM，并提供后台维护大师角色、角色提示词、头像背景和自定义体系。

界面支持简体中文和英文，可通过顶部语言按钮切换；语言偏好保存在浏览器本地。

### 功能

- 八字排盘：支持公历、农历和直接四柱输入。
- 多生辰档案：用户可以维护多个生辰并切换当前命盘。
- 多大师角色：内置道家、佛家、心理学派等角色，支持后台新增自定义大师。
- 自定义体系：后台可以维护角色绑定的解读体系、世界观和提示规则。
- AI 一键生成：在后台输入方向后，自动生成大师、角色提示词和对应体系草稿。
- 中英文界面：根据浏览器语言初始化，也可以手动切换并保存语言偏好。
- Markdown 解读：AI 输出支持 Markdown 结构化展示。
- 解读记录管理：支持查看、复制、删除和清空当前大师的历史消息。
- 图片裁剪上传：后台上传头像和背景时支持裁剪。
- 可选 PostgreSQL：支持用 DSN 保存角色、体系和上传图片；不配置时使用本地文件存储。

### 技术栈

- 前端：Vue 3、TypeScript、Vite
- 后端：Hono、Node.js
- 排盘：`lunar-javascript`
- 图标：`lucide-vue-next`
- 可选存储：PostgreSQL

### 本地开发

```bash
pnpm install
pnpm dev
```

另开一个终端启动服务端：

```bash
pnpm dev:server
```

常用校验：

```bash
pnpm test
pnpm build
```

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 `8787` |
| `ADMIN_USERNAME` | 管理后台用户名 |
| `ADMIN_PASSWORD` | 管理后台密码 |
| `SOOTHSAY_DATA_DIR` | 文件存储目录，默认容器内 `/data` |
| `SOOTHSAY_PG_DSN` | 可选，PostgreSQL DSN，优先级最高 |
| `DATABASE_URL` | 可选，兼容 Render 等平台的 PostgreSQL 连接串 |
| `POSTGRES_DSN` | 可选，备用 PostgreSQL 连接串 |
| `PGSSLMODE` | 可选，设为 `require` 启用 PostgreSQL SSL |

不要提交 `.env` 文件。用户的模型 `base_url`、`key`、命盘、语言偏好和对话记录存储在浏览器本地。

### Docker 部署

```bash
docker build -t soothsay:latest .
docker run -d \
  --name soothsay \
  -p 8787:8787 \
  -v soothsay-data:/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='change-me' \
  soothsay:latest
```

### Render 部署

推荐使用 Docker Web Service，让 Render 从仓库里的 `Dockerfile` 自动构建。

必须配置：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

如果使用 Render Disk：

- Disk 挂载到 `/data`
- `SOOTHSAY_DATA_DIR=/data`

如果使用 Render PostgreSQL：

- 配置 `DATABASE_URL` 或 `SOOTHSAY_PG_DSN`
- 外部连接串通常需要 `sslmode=require` 或 `PGSSLMODE=require`

启用 PostgreSQL 后，服务会自动创建：

- `soothsay_roles`
- `soothsay_engines`
- `soothsay_uploads`

### 隐私边界

- 服务端只保存部署者配置：自定义角色、自定义体系和上传图片。
- 用户的模型凭据、命盘、个人档案、语言偏好和对话记录保存在浏览器本地。
- 代理接口不记录 Authorization、请求正文或响应正文。

更多部署细节见 [docs/deployment.md](docs/deployment.md)。

### 致谢

- [linux.do](https://linux.do) 社区

---

## English

Current version: `0.2.1`

Soothsay is a self-hostable Bazi chart and fortune-reading application. Birth profiles, charts, and conversation history are managed locally in the browser. Users connect their own LLM credentials, while deployers can manage guide personas, prompts, avatars, backgrounds, and custom interpretation systems from the admin panel.

The interface supports Simplified Chinese and English. Use the language button in the top bar to switch languages; the preference is stored locally in the browser.

### Features

- Bazi chart generation with solar calendar, lunar calendar, and direct Four Pillars input.
- Multiple birth profiles with quick switching between active charts.
- Multiple guide personas, including built-in Taoist, Buddhist, and psychology-inspired guides, plus custom admin-managed personas.
- Custom interpretation systems with editable worldviews and prompt rules.
- AI-assisted persona generation from a short direction entered in the admin panel.
- Chinese and English UI with browser-language detection and a persistent manual switcher.
- Structured Markdown rendering for AI readings.
- Reading history management with view, copy, delete, and clear actions.
- Avatar and background image cropping during admin uploads.
- Optional PostgreSQL persistence for personas, systems, and uploaded images; local file storage is used by default.

### Technology

- Frontend: Vue 3, TypeScript, Vite
- Backend: Hono, Node.js
- Bazi calculations: `lunar-javascript`
- Icons: `lucide-vue-next`
- Optional storage: PostgreSQL

### Local development

```bash
pnpm install
pnpm dev
```

Start the server in another terminal:

```bash
pnpm dev:server
```

Run the standard checks:

```bash
pnpm test
pnpm build
```

### Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | Server port; defaults to `8787` |
| `ADMIN_USERNAME` | Admin-panel username |
| `ADMIN_PASSWORD` | Admin-panel password |
| `SOOTHSAY_DATA_DIR` | File-storage directory; defaults to `/data` in the container |
| `SOOTHSAY_PG_DSN` | Optional PostgreSQL DSN with the highest precedence |
| `DATABASE_URL` | Optional PostgreSQL connection string for platforms such as Render |
| `POSTGRES_DSN` | Optional fallback PostgreSQL connection string |
| `PGSSLMODE` | Optional; set to `require` to enable PostgreSQL SSL |

Do not commit `.env` files. User model credentials (`base_url` and `key`), charts, language preference, and conversation history are stored locally in the browser.

### Docker deployment

```bash
docker build -t soothsay:latest .
docker run -d \
  --name soothsay \
  -p 8787:8787 \
  -v soothsay-data:/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='change-me' \
  soothsay:latest
```

### Render deployment

Using a Docker Web Service is recommended so Render can build directly from the repository's `Dockerfile`.

Required variables:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

When using Render Disk:

- Mount the disk at `/data`.
- Set `SOOTHSAY_DATA_DIR=/data`.

When using Render PostgreSQL:

- Set `DATABASE_URL` or `SOOTHSAY_PG_DSN`.
- External connection strings usually require `sslmode=require` or `PGSSLMODE=require`.

With PostgreSQL enabled, the service automatically creates:

- `soothsay_roles`
- `soothsay_engines`
- `soothsay_uploads`

### Privacy boundaries

- The server stores deployer-managed configuration only: custom personas, custom interpretation systems, and uploaded images.
- User model credentials, charts, personal profiles, language preference, and conversation history remain in the browser.
- The proxy endpoint does not log Authorization headers, request bodies, or response bodies.

See [docs/deployment.md](docs/deployment.md) for additional deployment details in Chinese.

### Acknowledgements

- The [linux.do](https://linux.do) community

## License

MIT
