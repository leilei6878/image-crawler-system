# 分布式图片采集与调度系统

## 项目概述

基于 Node.js + PostgreSQL + Playwright 的分布式图片采集与扩采调度平台，支持多主机分布式爬取，附带 React Web 管理界面。

## 架构

- **server/** — Node.js/Express API (端口 3000)
  - `src/routes/` — API 路由 (jobs, hosts, images, tasks, stats)
  - `src/services/` — 核心服务 (scheduler, loadBalancer, logger)
  - `src/db.js` — MySQL→PostgreSQL 适配层 (? 转 $N, RETURNING id)
- **web/** — React + Vite 前端 (端口 5000)
  - `src/pages/` — 页面组件 (Dashboard, JobList, JobCreate, JobDetail, HostList, LogList)
  - `src/services/api.js` — API 客户端
- **worker/** — Playwright 爬虫 Worker
  - `src/adapters/` — 站点适配器 (pinterest, generic, ...)
  - `src/browser/pool.js` — 浏览器连接池
- **database/schema.sql** — PostgreSQL Schema

## 数据库

使用 Replit 托管 PostgreSQL，通过 `DATABASE_URL` 环境变量连接。

## 关键配置

- 前端运行在端口 5000（Replit 要求）
- API 服务器运行在端口 3000（前端通过 Vite proxy 转发 /api）
- PostgreSQL 适配层：将 MySQL `?` 占位符自动转换为 `$1, $2, ...`
- 心跳超时默认 90 秒，调度器每 30 秒检查一次

## 主要功能

- 创建/管理采集任务（支持 Pinterest, Behance, Unsplash 等）
- 主机管理与心跳监控
- 分布式任务分发与负载均衡
- 图片扩采（本地/自动/手动指定主机）
- 系统日志

## 运行方式

```bash
bash start.sh
```

Worker 单独运行（需要先配置 HOST_KEY 等环境变量）：
```bash
cd worker && node src/index.js
```
