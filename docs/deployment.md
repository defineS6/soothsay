# Soothsay 部署说明

## 环境变量

- `PORT`：服务端口，默认 `8787`。
- `SOOTHSAY_DATA_DIR`：部署者配置卷目录，容器内默认 `/data`。
- `SOOTHSAY_PG_DSN`：可选，PostgreSQL DSN。配置后后台角色、自定义体系与上传图片会写入 PostgreSQL。
- `DATABASE_URL` / `POSTGRES_DSN`：可选，兼容 Render 等平台的 PostgreSQL 连接字符串；优先级低于 `SOOTHSAY_PG_DSN`。
- `PGSSLMODE`：可选，设为 `require` 时启用 PostgreSQL SSL；DSN 中带 `sslmode=require` 也会自动启用。
- `ADMIN_USERNAME`：管理后台用户名，必须由部署者注入。
- `ADMIN_PASSWORD`：管理后台密码，必须由部署者注入。

## 构建镜像

```bash
docker build -t soothsay:latest .
```

## 单命令启动

```bash
docker run -d \
  --name soothsay \
  -p 8787:8787 \
  -v soothsay-data:/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='change-me' \
  soothsay:latest
```

首次启动后，终端用户可直接看到三位内置角色：云松道长、明澈法师、玄璃姐（心理学派）。后台创建的自定义角色与上传图片会写入 `/data` 卷，容器重启后保留。

## PostgreSQL 持久化

如果部署平台提供 PostgreSQL，可以只配置 DSN，不挂载 `/data` 磁盘：

```bash
docker run -d \
  --name soothsay \
  -p 8787:8787 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='change-me' \
  -e SOOTHSAY_PG_DSN='postgres://user:password@host:5432/db?sslmode=require' \
  soothsay:latest
```

启用 DSN 后，服务会自动创建以下表：

- `soothsay_roles`：自定义角色与内置角色资源覆盖。
- `soothsay_engines`：自定义体系。
- `soothsay_uploads`：后台上传的头像与背景图片。

如果首次启用 PostgreSQL 时 PG 为空，且本地 `/data/roles.json` 已存在，服务会把角色与体系自动导入 PG。上传图片不会自动迁移，需要重新上传或自行迁移。

Render 部署时可以使用平台提供的 `DATABASE_URL`，或者手动设置 `SOOTHSAY_PG_DSN`。如果使用 Render PostgreSQL 的外部连接串，通常需要 `sslmode=require` 或 `PGSSLMODE=require`。

## 隐私边界

用户的 `base_url`、`key`、命盘与对话存放在浏览器本地。服务端只保存部署者配置：自定义角色、自定义体系与上传图片。代理不记录 Authorization、请求正文或响应正文。
