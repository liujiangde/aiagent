## 目标
- 为 Web 与 CLI 增加可落地的会话持久化与 JSONL 日志记录，覆盖请求/工具执行的关键指标与错误信息，用于后续评估与监控。

## 路径与目录
- Web 持久化目录：
  - `apps/web/.data/logs.jsonl`（追加写入）
  - `apps/web/.data/sessions/<sessionId>.json`（会话快照）
- CLI 持久化目录：
  - `apps/cli/memory/logs/<sessionId>.jsonl`（每会话一条日志文件，便于隔离）

## 日志格式（JSONL，每行一个 JSON）
- 通用字段：
  - `ts`（ISO 时间）
  - `app`（`web`|`cli`）
  - `session_id`、`request_id`
  - `type`（`api_call`|`tool_run`|`assistant_reply`|`user_input`）
  - `route` 或 `tool`
  - `duration_ms`、`status`（`ok`|`error`）
  - `error`（可选，字符串）
  - `meta`（可选，如 `model`、`query`、`items_count` 等）
- 安全约束：不记录敏感信息（如 API Key、Cookie/Token 原文），对长文本截断到安全上限（如 2KB）。

## 会话文件结构（`sessions/<id>.json`）
- `session_id`、`started_at`、`last_updated_at`
- `messages`: `[{ role, content, at }]`
- `tool_calls`: `[{ tool, args_excerpt, observation_excerpt, at, duration_ms, status }]`
- `summary`（可选，后续用于短记忆）

## Web 端实现
- 新增服务端工具：`app/lib/logger.ts`
  - 提供 `appendLog(line)`、`ensureDirs()`、`writeSessionSnapshot(session)` 等函数
  - 仅在 Node 运行时执行文件写入（`process.env.NEXT_RUNTIME !== 'edge'` 守卫）
- 在以下路由接入日志：
  - `api/deepseek`：记录请求/响应耗时与状态；将用户消息写入会话；返回时写入助手回复
  - `api/rag/answer`、`api/rag/stream`、`api/rag/kb_answer`：记录查询、返回条数、生成时长；错误时记录 `error`
  - `api/tools/search`、`api/tools/web_fetch`：记录工具调用参数摘要与状态
- 会话 ID 传递：
  - 在前端 `page.tsx` 与 `/kb` 页面初始化 `sessionId`（`localStorage.__session_id__`，若无则生成 `crypto.randomUUID()`）
  - 所有 `fetch` 请求统一通过 `headers: {'x-session-id': sessionId}` 传给服务器
  - 服务器从请求头读取 `x-session-id`；如无则生成临时会话并回写到日志
- 会话快照：
  - 在 `api/deepseek` 和 RAG 路由中，累积 `messages` 与 `tool_calls`，在关键节点更新 `sessions/<id>.json`

## CLI 实现
- 启动生成 `sessionId`（随机 UUID），打印提示；在内存中维护 `messages` 列表
- 新增轻量日志工具：`apps/cli/src/logger.ts`（同步追加写）
  - `append(line)`、`ensureSessionLog(sessionId)`、`snapshotSession(sessionId, data)`
- 在 CLI 主循环中：
  - 用户输入时写 `user_input`
  - LLM 调用前后记录 `api_call`（模型、温度、耗时）与 `assistant_reply`
  - 解析并执行工具时记录 `tool_run`（工具名、参数摘要、耗时、状态）与观测摘要
  - 定期写入会话快照（如每 5 次交互或显式退出时）

## 运行与验证
- Web：
  - 启动 `npm run dev -w apps/web`，操作首页和 `/kb` 页面多次交互
  - 检查 `apps/web/.data/logs.jsonl` 行数增长、字段完整，`apps/web/.data/sessions/<id>.json` 内容随交互更新
- CLI：
  - 构建并运行 CLI，与 LLM和工具交互几轮
  - 查看 `apps/cli/memory/logs/<sessionId>.jsonl` 是否持续追加；快照文件正确生成

## 边界与约束
- Next.js 生产部署到无状态/只读文件系统时，需替换为外部存储（S3/DB）；当前开发环境以本地文件为主，代码中保留接口抽象，方便后续替换
- 写入采用同步/原子追加，避免多路由并发竞争导致日志破碎；必要时引入简单队列
- 日志大小滚动策略：达到上限（如 50MB）时切换到新文件（后续扩展）

## 交付项
- 新增日志与会话工具文件（Web/CLI）
- 路由与 CLI 主循环的日志接入
- 文档注释与最小使用说明（在代码头部注释与工具函数注释中体现）

请确认以上方案，我将开始实现并回传验证结果与路径。