# 被控端新电脑部署包

这个目录用于把一台全新的 Windows 电脑部署成 `image-crawler-system` 的被控端 Worker。

目标：

- 不要求新电脑先装 Git
- 支持一键下载安装 Worker
- 支持一键启动
- 支持一键更新
- 支持开机自启

## 目录说明

- `worker_install_config.ps1`
  - 安装配置文件。先改这里。
- `01_install_worker.bat`
  - 新电脑首次安装用。
- `02_start_worker.bat`
  - 手动启动 Worker。
- `03_update_worker.bat`
  - 更新到 GitHub 最新版本，并保留已有 cookies。
- `04_enable_autostart.bat`
  - 设置开机自启。
- `05_disable_autostart.bat`
  - 取消开机自启。
- `install_worker_from_github.ps1`
  - 实际安装脚本。
- `update_worker_from_github.ps1`
  - 实际更新脚本。
- `start_worker.ps1`
  - 实际启动脚本。

## 新电脑部署步骤

### 1. 先改配置

打开 `worker_install_config.ps1`，至少改这几个值：

```powershell
$ServerUrl = "http://192.168.0.8:3000"
$HostKey = "worker-001"
$HostName = "Worker-001"
$MaxConcurrency = 5
```

说明：

- `ServerUrl`
  - 主控端后端地址
- `HostKey`
  - 必须和主控端“主机密钥”一致
- `HostName`
  - 主控页面展示名
- `MaxConcurrency`
  - 启动初始并发。后续主控端会回传实际并发

### 2. 首次安装

双击：

```text
01_install_worker.bat
```

安装完成后，代码会放到：

```text
runtime\repo\image-crawler-system-codex-worker-installer
```

安装日志会写到：

```text
logs\worker-install.log
logs\worker-install-status.json
```

### 3. 放 Pinterest 登录态

如果需要 Pinterest 登录采集，把登录态文件放到：

```text
runtime\repo\image-crawler-system-codex-worker-installer\worker\cookies\pinterest.json
```

### 4. 手动启动

双击：

```text
02_start_worker.bat
```

启动成功后，窗口里应看到类似：

```text
[Worker] Starting - HOST_KEY=worker-001 MAX_CONCURRENCY=5
[Heartbeat] OK - hostId=5 running=0
```

### 5. 更新

双击：

```text
03_update_worker.bat
```

它会：

- 从 GitHub 下载最新分支 zip
- 覆盖 runtime 中的代码
- 保留已有 `cookies/`
- 重新写入 `.env`

### 6. 开机自启

启用：

```text
04_enable_autostart.bat
```

关闭：

```text
05_disable_autostart.bat
```

## 常见问题

### 1. 没装 Node.js

默认会尝试用 `winget` 安装 Node.js LTS。

### 2. 主控端连不上

先在新电脑 PowerShell 手动试：

```powershell
Invoke-WebRequest http://192.168.0.8:3000/api/health
```

### 3. 主机删了又回来

如果旧 worker 进程还在运行，它会继续打心跳并自动注册回来。先停掉旧进程，再删主机记录。

### 4. worker 代码目录

这个部署包不会直接修改你当前仓库目录，而是固定把运行时代码放在：

```text
worker-deploy-package\runtime\repo\image-crawler-system-codex-worker-installer
```

这样安装包和运行代码分离，方便更新。
