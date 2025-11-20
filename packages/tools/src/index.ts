import fs from "node:fs"
import path from "node:path"
import * as kb from "@aiagent/retrieval"

// 工具调用结构：包含工具名称和参数
export type ToolCall = { tool: string; args: Record<string, any> }

// 工具定义：名称和异步执行函数
export type Tool = {
  name: string
  run: (args: Record<string, any>) => Promise<any>
}

// 工具注册表：键为工具名，值为工具对象
export type ToolRegistry = Record<string, Tool>

/**
 * 从文本中解析工具调用
 * 优先匹配 >>>TOOL: 开头的 JSON，其次尝试直接解析整段文本
 */
export function parseToolCall(text: string): ToolCall | null {
  const m = text.match(/>>>TOOL:\s*(\{[\s\S]*\})/)
  if (m) {
    try {
      const obj = JSON.parse(m[1])
      if (obj && typeof obj.tool === "string" && typeof obj.args === "object") return obj as ToolCall
    } catch {}
  }
  try {
    const obj = JSON.parse(text)
    if (obj && typeof obj.tool === "string" && typeof obj.args === "object") return obj as ToolCall
  } catch {}
  return null
}

/**
 * 根据注册表执行工具调用
 * 若工具不存在则抛出 unknown_tool 错误
 */
export async function executeTool(registry: ToolRegistry, call: ToolCall): Promise<any> {
  const t = registry[call.tool]
  if (!t) throw new Error("unknown_tool")
  return t.run(call.args ?? {})
}

/**
 * 返回内置工具注册表
 * 包含 now、calc、read_file 三个工具
 */
export function builtinTools(): ToolRegistry {
  // 文档根目录，限制文件读取范围
  const baseDocs = path.resolve(__dirname, "../../../文档")
  return {
    // 获取当前 ISO 时间
    now: {
      name: "now",
      run: async () => ({ iso: new Date().toISOString() })
    },
    // 知识库：添加纯文本到索引并持久化
    kb_add_text: {
      name: "kb_add_text",
      run: async (args) => {
        const title = String(args?.title ?? "")
        const text = String(args?.text ?? "")
        if (!text || text.length < 10) throw new Error("text_too_short")
        if (text.length > 200_000) throw new Error("text_too_long")
        const out = kb.addDocument({ title, text })
        const st = kb.stats()
        return { added: out.added, docId: out.docId, stats: st }
      }
    },
    // 知识库：语义检索，返回 Top-k 片段
    kb_search: {
      name: "kb_search",
      run: async (args) => {
        const query = String(args?.query ?? "").trim()
        const k = Math.max(1, Math.min(10, Number(args?.k ?? 5)))
        if (!query) throw new Error("missing_query")
        const res = kb.search({ query, k })
        return res
      }
    },
    // 安全计算表达式，仅允许数字与运算符
    calc: {
      name: "calc",
      run: async (args) => {
        const expr = String(args?.expr ?? "")
        if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error("invalid_expr")
        // eslint-disable-next-line no-new-func
        const val = Function(`return (${expr})`)()
        return { result: val }
      }
    },
    // 读取指定路径的文本文件，禁止越界访问
    read_file: {
      name: "read_file",
      run: async (args) => {
        const rel = String(args?.path ?? "")
        if (!rel || rel.includes("..")) throw new Error("invalid_path")
        const full = path.resolve(baseDocs, rel)
        if (!full.startsWith(baseDocs)) throw new Error("forbidden")
        const txt = fs.readFileSync(full, "utf8")
        return { content: txt }
      }
    },
    // 抓取网页内容：验证 URL、屏蔽本地地址、支持超时与长度限制，HTML 则去标签
    web_fetch: {
      name: "web_fetch",
      run: async (args) => {
        const url = String(args?.url ?? "")
        if (!url) throw new Error("missing_url")
        let u: URL
        try { u = new URL(url) } catch { throw new Error("invalid_url") }
        if (!(u.protocol === "http:" || u.protocol === "https:")) throw new Error("unsupported_protocol")
        const host = u.hostname.toLowerCase()
        if (host === "localhost" || host.startsWith("127.") || host === "::1") throw new Error("forbidden_host")
        const timeout = Number.isFinite(Number(args?.timeout_ms)) ? Number(args?.timeout_ms) : 10000
        const maxBytes = Number.isFinite(Number(args?.max_bytes)) ? Number(args?.max_bytes) : 100000
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), timeout)
        try {
          const resp = await fetch(url, { signal: controller.signal })
          const status = resp.status
          const contentType = resp.headers.get("content-type") || ""
          const textRaw = await resp.text()
          const text = contentType.includes("html")
            ? textRaw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
            : textRaw
          const truncated = text.length > maxBytes ? text.slice(0, maxBytes) : text
          return { url, status, contentType, text: truncated }
        } finally {
          clearTimeout(t)
        }
      }
    },
    // 维基百科搜索：调用开放 API，返回标题、链接和纯文本摘要
    search: {
      name: "search",
      run: async (args) => {
        const query = String(args?.query ?? "").trim()
        if (!query) throw new Error("missing_query")
        const limit = Math.max(1, Math.min(10, Number(args?.limit ?? 5)))

        async function tryHtml(source: "bing" | "so" | "baidu"): Promise<Array<{ title: string; url: string; snippet: string }>> {
          let url = ""
          let pattern: RegExp
          const UA = { headers: { "User-Agent": "aiagent/0.1", "Accept": "text/html" } }
          if (source === "bing") {
            url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`
            // <li class="b_algo"> ... <h2><a href="URL">TITLE</a></h2> ... <p>SNIPPET</p>
            pattern = /<li class=\"b_algo\">[\s\S]*?<h2>\s*<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
          } else if (source === "so") {
            url = `https://www.so.com/s?q=${encodeURIComponent(query)}&num=${limit}`
            // <h3 class="res-title"> <a href="URL">TITLE</a> ... <p class="res-desc">SNIPPET</p>
            pattern = /<h3[^>]*res-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*res-desc[^>]*>([\s\S]*?)<\/p>/gi
          } else {
            url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`
            // <h3 class="c-title"> <a href="URL">TITLE</a> ... <div class="c-abstract">SNIPPET</div>
            pattern = /<h3[^>]*c-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]*c-abstract[^>]*>([\s\S]*?)<\/div>/gi
          }
          const resp = await fetch(url, UA)
          if (!resp.ok) return []
          const html = await resp.text()
          const items: Array<{ title: string; url: string; snippet: string }> = []
          let m: RegExpExecArray | null
          while ((m = pattern.exec(html)) && items.length < limit) {
            const href = m[1]
            const title = String(m[2]).replace(/<[^>]+>/g, " ").trim()
            const snippet = String(m[3]).replace(/<[^>]+>/g, " ").trim()
            items.push({ title, url: href, snippet })
          }
          return items
        }

        let items = await tryHtml("bing")
        if (items.length === 0) items = await tryHtml("so")
        if (items.length === 0) items = await tryHtml("baidu")
        return { query, items }
      }
    }
  }
}

/**
 * 生成系统提示文本，告知模型可用工具及调用格式
 */
export function toolSystemPrompt(registry: ToolRegistry): string {
  const names = Object.keys(registry)
  return [
    "你可以调用工具。当需要工具时，严格输出一行以 >>>TOOL: 开头的 JSON，格式",
    "{ \"tool\": string, \"args\": object }",
    `可用工具: ${names.join(", ")}`,
    "若无需工具，输出正常回答文本。"
  ].join("\n")
}