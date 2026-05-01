# image-crawler-system

`image-crawler-system` 是一个图片爬虫系统的最小 Python 项目骨架。当前目标不是一次性实现完整分布式采集平台，而是先建立清晰、可运行、可测试、可扩展的基础结构。

## 当前状态

项目现在已经从最小 Python 骨架推进到 generic HTML 图片提取基础层：

- 使用 Python 作为主运行时。
- 提供环境变量配置加载能力。
- 提供带 timeout、retry、User-Agent 和并发边界意识的 HTTP fetcher。
- 提供 URL normalization / validation 与图片元数据模型。
- 支持从普通 HTML 中提取 `img[src]`、`img[srcset]`、`meta[property="og:image"]`、`link rel=image_src`。
- 提供 generic HTML adapter，用于输入普通网页 URL 后抓取 HTML 并提取图片资产。
- 提供 pytest 测试结构，测试不依赖真实外网请求。

尚未实现的能力：

- 具体社媒平台适配器、登录态采集或反爬绕过。
- 图片二进制下载和资产存储。
- 持久化存储。
- 任务队列、调度器或分布式 worker 编排。
- UI/API 管理端。
- 完整日志、监控和失败重试策略。

## 项目结构

```text
.
├── .github/workflows/ci.yml
├── .env.example
├── AGENTS.md
├── README.md
├── docs/
│   ├── PROJECT_CONTEXT.md
│   └── TODO.md
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

当前运行入口只会加载配置并初始化示例爬虫，不会发起真实网络请求：

```sh
python -m src.main
```

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
- `docs/TODO.md` 跟踪后续工程任务。
- `docs/WORKER_DEPLOYMENT.md` 说明被控端 Worker 的一键安装、配置和安装状态监测。
- `AGENTS.md` 定义 AI coding agent 的协作规则。
