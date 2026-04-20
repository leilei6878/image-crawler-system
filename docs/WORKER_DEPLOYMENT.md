# 被控端 Worker 部署说明

本文说明如何把一台机器部署为 `image-crawler-system` 的被控端 Worker。

## 前置条件

被控端需要：

- Windows 10/11 或 Windows Server
- Node.js 20+
- npm
- 能访问主控端 API，例如 `http://主控端IP:3000`

安装脚本会自动安装 Worker 依赖和 Playwright Chromium。默认不会自动安装 Node.js；如果确实需要，可以使用 `-InstallNodeIfMissing` 参数让脚本尝试通过 `winget` 安装 Node.js LTS。

## 一键安装

在仓库根目录运行：

```powershell
.\install_worker.bat
```

默认配置会连接本机主控端：

```text
SERVER_URL=http://127.0.0.1:3000
HOST_KEY=local-worker-001
HOST_NAME=<当前电脑名>
MAX_CONCURRENCY=1
PULL_INTERVAL_MS=5000
```

如果主控端在另一台机器，建议直接运行 PowerShell 安装器并传入主控端地址：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install_worker.ps1 `
  -ServerUrl "http://192.168.1.20:3000" `
  -HostKey "worker-001" `
  -HostName "Worker-001" `
  -MaxConcurrency 1
```

## 安装过程监测

安装器会写入两个文件：

```text
logs/worker-install.log
logs/worker-install-status.json
```

实时查看日志：

```powershell
Get-Content .\logs\worker-install.log -Wait
```

查看当前安装状态：

```powershell
Get-Content .\logs\worker-install-status.json
```

状态文件会记录当前步骤、状态、主控端地址、Worker 目录和日志位置。

## 常用参数

```powershell
.\scripts\install_worker.ps1 -ServerUrl "http://192.168.1.20:3000"
```

覆盖已有 `worker/.env`：

```powershell
.\scripts\install_worker.ps1 -ForceEnv
```

安装完成后自动启动 Worker：

```powershell
.\scripts\install_worker.ps1 -StartWorker
```

跳过主控端连通性检查：

```powershell
.\scripts\install_worker.ps1 -SkipConnectivityCheck
```

跳过 Playwright Chromium 安装，主要用于快速验证脚本：

```powershell
.\scripts\install_worker.ps1 -SkipBrowserInstall
```

Node.js 缺失时尝试用 `winget` 安装：

```powershell
.\scripts\install_worker.ps1 -InstallNodeIfMissing
```

## 手动启动 Worker

安装完成后可以手动启动：

```powershell
cd .\worker
npm start
```

启动成功后应能看到类似日志：

```text
[Worker] ...
[Heartbeat] OK - hostId=...
```

如果 heartbeat 失败，优先检查：

- 主控端 API 是否运行。
- `worker/.env` 中的 `SERVER_URL` 是否正确。
- 主控端防火墙是否放行 `3000` 端口。
- 被控端和主控端是否在同一网络或 VPN 中。

## Pinterest 登录态

当前 Pinterest 采集默认要求登录态。Worker 会优先读取以下文件：

```text
worker/cookies/pinterest-storage-state.json
worker/cookies/pinterest.json
```

也可以通过环境变量显式指定：

```env
PINTEREST_STORAGE_STATE_PATH=./cookies/pinterest-storage-state.json
PINTEREST_COOKIE_PATH=./cookies/pinterest.json
```

建议优先使用 Playwright 导出的 `storage state`。如果没有有效登录态，Pinterest 任务会明确报错，而不是退回游客模式。

如果你明确要允许游客采集，可以在 `worker/.env` 中加入：

```env
PINTEREST_REQUIRE_LOGIN=false
```

## 不要提交的内容

以下文件只用于本地部署，不应提交到仓库：

- `worker/.env`
- `logs/`
- `worker/node_modules/`
- `worker/screenshots/`
