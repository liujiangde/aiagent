# Web 模块（Next.js）

作用
- 提供 Web 端对话、工具与 RAG 能力的演示界面与服务端 API；安全代理模型调用；开发环境写本地日志与会话持久化。

主要页面
- 首页：`/` 对话、检索、抓取、RAG（含流式）
- 知识库页：`/kb` 文本入库、语义检索与索引统计

服务端 API
- `GET /api/deepseek`：返回是否已配置 `DEEPSEEK_API_KEY`
- `POST /api/deepseek`：安全代理 Chat Completions（仅服务端读取密钥）
- 工具：`POST /api/tools/search`、`POST /api/tools/web_fetch`
- RAG：`POST /api/rag/answer`、`POST /api/rag/stream`
- 知识库：`POST/GET /api/kb/add_text`、`POST /api/kb/search`、`POST /api/rag/kb_answer`

会话与日志
- 前端在本地生成并传递 `x-session-id` 请求头，用于关联日志与会话
- 日志文件：`apps/web/.data/web/logs.jsonl`（JSONL 追加）
- 会话快照：`apps/web/.data/web/sessions/<sessionId>.json`

开发运行
- `pnpm --filter web dev` 打开 `http://localhost:3000/`
- 或在根执行 `pnpm run dev`（Turbo 执行 web 及依赖）

环境变量
- 在 `apps/web/.env.local` 设置 `DEEPSEEK_API_KEY=你的密钥`
- 示例文件为占位：`apps/web/.env.example:1-2`
- 校验接口：`GET /api/env-check` 返回 `{ ok, missing, keys }`

安全说明
- API Key 仅在服务端读取；日志中不记录敏感信息；长文本做安全截断
