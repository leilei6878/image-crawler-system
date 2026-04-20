# image-crawler-system

`image-crawler-system` 是一个图片爬虫系统的最小 Python 项目骨架。当前目标不是一次性实现完整分布式采集平台，而是先建立清晰、可运行、可测试、可扩展的基础结构。

## 当前状态

项目现在已经从纯文档阶段推进到最小可运行 Python 项目阶段：

- 使用 Python 作为主运行时。
- 提供最小配置加载能力。
- 提供爬虫适配器接口骨架和一个示例适配器。
- 提供 pytest 测试结构。
- GitHub Actions 会安装依赖并运行测试。

尚未实现的能力：

- 真实网页抓取和图片下载。
- 站点级适配器规则。
- 持久化存储。
- 任务队列、调度器或分布式 worker。
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
│   ├── __init__.py
│   ├── main.py
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py
│   └── crawlers/
│       ├── __init__.py
│       ├── base.py
│       └── example.py
└── tests/
    ├── test_example_crawler.py
    └── test_settings.py
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
| `DATA_DIR` | `./data` | 本地数据目录 |
| `DOWNLOAD_DIR` | `./data/downloads` | 图片下载目录 |

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
- `AGENTS.md` 定义 AI coding agent 的协作规则。
