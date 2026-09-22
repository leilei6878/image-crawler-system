# image-crawler-system

## Social Brand Account Crawling V1

This repository now includes the first architecture slice for social brand
account image crawling. The current scope is model and orchestration first:

- Model a public social account or public page URL as `SocialAccountSource`.
- Create `CrawlJob` records for `historical`, `incremental`, or `temporary`
  crawl modes.
- Run public-page jobs through the Node management database and distributed
  Worker protocol. Interval/recovery acceptance remains in progress.
- Route sources through a platform adapter registry.
- Use `mock_social_adapter` and `generic_public_page_adapter` as the first
  testable adapters.

This is not a login crawler and does not bypass platform controls. It does not
store cookies, credentials, tokens, or private API details. Real platform
adapters for Xiaohongshu, Weibo, Instagram, Pinterest, TikTok, and similar
platforms must be developed separately with explicit public-content and
rate-limit policies.

Example local CLI flow:

```sh
python -m src.main create-social-source \
  --platform website \
  --account-name "Example Brand" \
  --profile-url "https://example.com/gallery" \
  --max-items 20

python -m src.main create-job --source-id <source_id>
python -m src.main run-job --job-id <job_id>
python -m src.main job-status --job-id <job_id>
```

The CLI uses the same management API as the page by default. Set
`ADMIN_API_TOKEN` locally and optionally `SERVER_URL` (default
`http://127.0.0.1:3100`). Only explicit `--demo` uses a separate
`data/social_crawler_state.json` file. The `data/` directory is ignored. See
`docs/SOCIAL_CRAWLING_DESIGN.md` for the adapter, scheduler, and safety
boundary design.

The master web UI also includes a first social crawling management page at
`/social`. In the distributed V1 delivery baseline, public website sources use
the real Node management server, database tables, existing Worker task
pull/report protocol, and Worker generic adapter. Non-website social platforms
remain clearly marked as mock/unsupported and cannot be treated as successful
real crawls.

`image-crawler-system` 是一个分布式图片采集系统。当前目标不是一次性实现完整社媒平台，而是在保留现有架构的前提下交付本地可稳定运行的 V1：通用公开网页真实采集、Worker 分发执行、结果入库和管理页查看。

## 当前状态

项目现在已经从最小 Python 骨架推进到分布式采集 V1 交付阶段：

- Node 管理端负责业务状态和 Worker 调度；Python 负责可复用的 HTML 图片提取。
- 提供环境变量配置加载能力。
- 提供带 timeout、retry、User-Agent 和并发边界意识的 HTTP fetcher。
- 提供 URL normalization / validation 与图片元数据模型。
- 支持从普通 HTML 中提取 `img[src]`、`img[srcset]`、`meta[property="og:image"]`、`link rel=image_src`。
- 提供 generic HTML adapter，用于输入普通网页 URL 后抓取 HTML 并提取图片资产。
- 提供 pytest 测试结构，测试不依赖真实外网请求。
- 提供 Node 管理端、数据库 schema、Worker 心跳、任务拉取和结果回传协议。
- 提供 `/social` 社媒采集管理页；V1 中只有 `website` 来源走真实公开网页采集链路。

仍在加固或后续阶段实现的能力：

- 小红书、微博、Instagram、Pinterest、TikTok 等具体社媒平台真实适配器。
- 登录态采集、cookie 抓取、验证码绕过、风控绕过或私有 API 破解不会在本项目中作为默认能力实现。
- 图片二进制下载、大小/类型限制和本地资产存储仍需继续加固。
- Worker 崩溃回收、幂等回传、持续调度和重试策略仍在 V1 交付计划中推进。

## 项目结构

```text
.
├── .github/workflows/ci.yml
├── .env.example
├── AGENTS.md
├── README.md
├── docs/
│   ├── PROJECT_CONTEXT.md
│   ├── DELIVERY_PLAN.md
│   ├── SOCIAL_CRAWLING_DESIGN.md
│   └── TODO.md
├── database/
├── server/
├── web/
├── worker/
├── requirements.txt
├── src/
│   ├── config/
│   ├── crawlers/
│   ├── extractors/
│   ├── fetching/
│   ├── models/
│   └── main.py
└── tests/
```

## 本地安装

建议使用 Python 3.12 或更新版本。

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 配置方式

复制环境变量模板：

```sh
cp .env.example .env
```

当前代码从环境变量读取配置。支持的变量包括：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `development` | 应用运行环境 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `CRAWL_TIMEOUT` | `30` | 单次抓取超时时间，单位秒 |
| `CRAWL_RETRY_COUNT` | `3` | 抓取失败后的重试次数 |
| `CRAWL_CONCURRENCY` | `4` | 并发抓取数量上限 |
| `CRAWL_USER_AGENT` | `image-crawler-system/0.1` | HTTP 请求 User-Agent |
| `DATA_DIR` | `./data` | 本地数据目录 |
| `DOWNLOAD_DIR` | `./data/downloads` | 图片下载目录 |

## Generic HTML 图片提取

当前支持的是通用 HTML 图片发现，不绑定具体社媒平台，也不处理登录态 cookie、反爬绕过或私有 API。

`GenericHtmlAdapter` 会：

- 校验和标准化输入 URL。
- 使用 HTTP fetcher 拉取 HTML。
- 从 HTML 中提取常见图片入口。
- 输出标准化 `ImageAsset` 列表，并按 normalized image URL 去重。

示例：

```python
from src.config import Settings
from src.crawlers import CrawlRequest, GenericHtmlAdapter

crawler = GenericHtmlAdapter(Settings.from_env())
result = crawler.crawl(CrawlRequest(url="https://example.com/gallery"))

for image in result.images:
    print(image.normalized_image_url)
```

## 本地运行

Python generic adapter 可以通过 CLI 运行；管理端真实链路需要数据库、Node server、web 和 worker 一起运行。

```sh
python -m src.main
```

Node 管理端：

```sh
cd server
npm install
PORT=3100 BIND_HOST=127.0.0.1 npm start
```

Web 管理页：

```sh
cd web
npm install
npm run dev
```

Worker：

```sh
cd worker
npm install
npx playwright install chromium
npm start
```

默认 Worker 通过 `SERVER_URL` 连接管理端，默认值是 `http://localhost:3000`。不要使用 mock server 作为真实验收依据；正常 V1 验收应看到 `/social` 页面创建 website 来源后，任务进入 Worker 拉取、结果写入数据库，并在页面运行结果中可见。

如果本机 `3000` 已被调试中台占用，请使用其他 `PORT` 启动本仓库 Node 管理端，并把 Worker 的 `SERVER_URL` 指向该端口。默认 `BIND_HOST=127.0.0.1`；只有需要局域网 Worker 连接时才显式改成可访问地址。默认 `REQUIRE_WORKER_AUTH=true`，Worker 拉取和回传必须携带匹配的 `HOST_KEY`；`ALLOW_LOCAL_CRAWL_TARGETS=false` 只应在受控本地 HTML 测试时临时打开。

首次运行数据库前请先按 `docs/DB_MIGRATIONS.md` 备份并应用迁移。图片保存会写入 ignored 的 `downloads/` 目录，并受大小、类型、超时和跳转限制约束。

当前用户权限下的本地运行与停止方法见 `docs/LOCAL_RUNTIME.md`。
已通过受控 HTML 服务的页面创建来源、任务、真实 Worker/Python 执行、入库、
图片下载及桌面/移动端检查。完整 V1 尚未验收，双 Worker、崩溃恢复、持久限速、
重试退避、增量运行历史、备份恢复和持续观察仍按 `docs/DELIVERY_PLAN.md` 推进。

## 运行测试

```sh
pytest
```

也可以显式使用 Python 模块方式运行：

```sh
python -m pytest
```

## 文档

- `docs/PROJECT_CONTEXT.md` 记录当前项目背景、边界和架构假设。
- `docs/DELIVERY_PLAN.md` 记录 V1 交付计划、恢复基线、验证命令和已知阻塞。
- `docs/DB_MIGRATIONS.md` 说明数据库迁移、备份和恢复方法。
- `docs/TODO.md` 跟踪后续工程任务。
- `docs/WORKER_DEPLOYMENT.md` 说明被控端 Worker 的一键安装、配置和安装状态监测。
- `AGENTS.md` 定义 AI coding agent 的协作规则。
