# 文件上传服务

基于 Express + TypeScript 的文件上传服务。Docker Compose 会把容器内的
`/data/uploads` 挂载到 Docker 宿主机上的 `SAVE_FILE_PATH`，上传文件会持久化
保存在宿主机目录中。

## 接口

- `GET /health`：健康检查。
- `POST /upload`：使用 `multipart/form-data` 上传一个或多个文件。
- `GET /files`：查看已保存文件列表。
- `GET /files/:fileName`：下载指定文件。

示例：

```bash
curl -F "file=@./demo.png" http://localhost:3000/upload
```

## 本地开发

```bash
npm install
npm run dev
```

## 本地 Docker 运行

```bash
cp .env.example .env
mkdir -p uploads
docker compose up --build -d
```

默认会把文件保存到 `./uploads`。如果要保存到其他宿主机路径，修改 `.env` 中的
`SAVE_FILE_PATH`。

## GitHub Actions 部署

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) 是手动触发的
workflow，会执行以下步骤：

1. 安装依赖并构建 TypeScript。
2. 构建 Docker 镜像并推送到镜像仓库。
3. 把 `docker-compose.prod.yml` 和生成的 `.env` 上传到远程服务器。
4. 在远程服务器执行 `docker compose pull` 和 `docker compose up -d`。

### GitHub Actions Variables

需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions -> Variables`
中配置：

- `IMAGE_NAMESPACE`：镜像命名空间，例如 `owner` 或组织名。
- `SAVE_FILE_PATH`：远程 Docker 宿主机上保存上传文件的绝对路径，例如 `/data/file-upload-server/uploads`。

可选配置：

- `APP_PORT`：宿主机暴露端口，默认 `3000`。
- `DEPLOY_PATH`：远程服务器上的 Compose 部署目录，默认 `/opt/file-upload-server`。
- `UPLOAD_MAX_FILE_SIZE`：单文件最大字节数，默认 `104857600`。
- `UPLOAD_MAX_FILES`：单次请求最大文件数，默认 `10`。
- `UPLOAD_ALLOWED_MIME_TYPES`：允许上传的 MIME 类型，多个值用英文逗号分隔，例如 `image/png,image/jpeg`；为空表示不限制。
- `PUBLIC_BASE_URL`：返回文件访问地址时使用的公网基础地址。

手动运行 workflow 时，也可以在 `Run workflow` 页面填写 `image_namespace`，该输入
会覆盖仓库 Variables 中的 `IMAGE_NAMESPACE`。

### GitHub Actions Secrets

需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions -> Secrets`
中配置：

- `IMAGE_REGISTRY`：镜像仓库地址，例如 `ghcr.io`。
- `IMAGE_REGISTRY_USERNAME`：镜像仓库用户名。
- `IMAGE_REGISTRY_PASSWORD`：镜像仓库密码或访问令牌。
- `SERVER_HOST`：远程服务器 IP 或域名。
- `SERVER_USER`：远程服务器 SSH 用户名。
- `SERVER_PASSWORD`：远程服务器 SSH 密码。

可选配置：

- `SERVER_PORT`：远程服务器 SSH 端口，默认 `22`。

远程服务器需要提前安装 Docker 和 Docker Compose plugin。workflow 会先登录镜像仓库，
再拉取新镜像并更新服务。

## 镜像命名规则

workflow 会自动生成镜像名称：

```text
${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/${package.json name}:${当前分支名最后一段}
```

例如，分支 `feature/upload-api` 会构建：

```text
ghcr.io/owner/file-upload-server:upload-api
```
