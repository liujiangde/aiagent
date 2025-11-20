作用
- 提供 Agent 的工具协议与执行适配层，统一解析模型的工具调用输出，并安全执行本地/外部工具。

包含内容
- 类型与协议：`ToolCall`、`Tool`、`ToolRegistry`
- 解析与执行：`parseToolCall(text)`、`executeTool(registry, call)`
- 内置工具：`builtinTools()` 提供 `now`、`calc`、`read_file`、`web_fetch`、`search`、`kb_add_text`、`kb_search`
- 系统提示：`toolSystemPrompt(registry)` 返回工具说明与严格输出格式提示

使用示例（在 CLI 中）
```ts
import { builtinTools, parseToolCall, executeTool, toolSystemPrompt } from "@aiagent/tools"

const tools = builtinTools()
const sys = toolSystemPrompt(tools)
// 1) 让模型先按提示决定是否调用工具
const answer = await llm([{ role: "system", content: sys }, ...messages])
// 2) 若输出中包含工具调用 JSON，则执行并将观察结果回填，再次询问模型
const call = parseToolCall(answer)
if (call) {
  const obs = await executeTool(tools, call)
  messages.push({ role: "assistant", content: JSON.stringify({ observation: obs }) })
  const final = await llm(messages)
}
```

内置工具说明
- `now`: 返回当前时间 ISO 字符串
- `calc`: 计算安全表达式（仅数字与 + - * / () . 空格），返回结果
- `read_file`: 只允许读取仓库 `文档/` 目录下的文件，阻止越权路径
- `web_fetch`: 拉取网页文本，限制 `http/https` 协议与禁止 `localhost/127.0.0.1`，支持超时与返回文本截断
- `search`: 使用搜索引擎（Bing/360/百度）的 HTML 抽取进行简单检索，返回标题、摘要片段与链接
- `kb_add_text`: 将纯文本分块、向量化并写入本地知识库索引（依赖 `@aiagent/retrieval`）
- `kb_search`: 基于本地知识库做语义检索，返回 Top‑k 片段

安全约束
- 参数校验与最小权限：`calc` 仅允许安全字符；`read_file` 限制在 `文档/` 路径内
- 执行错误分类：未知工具、非法参数、越权访问等会抛错，调用方需捕获并处理

扩展建议
- 根据业务添加工具（如 `web_fetch`、`search`、`write_file`），并在系统提示中列出
- 为每个工具定义清晰的参数 JSON Schema 与错误语义，便于模型选择与宿主校验

知识库工具用法（CLI 示例）
```bash
# 添加文本到知识库（title 可选）
/tool {"tool":"kb_add_text","args":{"title":"示例","text":"你的长文本..."}}

# 语义检索 Top‑k 片段
/tool {"tool":"kb_search","args":{"query":"检索问题","k":5}}
```