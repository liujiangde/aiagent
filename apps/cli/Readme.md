# CLI 模块

作用
- 提供最小可用的命令行 Agent：历史上下文对话、工具调用闭环与本地 JSONL 日志记录。

运行
- 构建：`npm run build -w apps/cli`
- 启动：`npm run start -w apps/cli`

使用
- 输入用户消息直接对话；输入 `/exit` 退出
- 工具调用（示例）：
  - `/tool {"tool":"kb_add_text","args":{"title":"示例","text":"你的长文本..."}}`
  - `/tool {"tool":"kb_search","args":{"query":"问题","k":5}}`

日志
- 每次启动生成一个 `sessionId`，日志写入 `apps/cli/memory/logs/<sessionId>.jsonl`
- 记录事件：`user_input`、`api_call`、`tool_run`、`assistant_reply` 与错误信息

环境变量
- `DEEPSEEK_API_KEY`：调用模型时所需；未配置则对话调用会报错