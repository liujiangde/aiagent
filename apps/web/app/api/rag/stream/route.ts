import { NextRequest } from "next/server"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders } from "../../../lib/logger"

/**
 * 根据关键词从搜索引擎抓取 HTML 结果
 * @param query 搜索关键词
 * @param limit 最大返回条数
 * @returns 标题、链接、摘要数组
 */
async function searchHtml(query: string, limit: number) {
  /**
   * 尝试从指定搜索引擎抓取
   * @param source 搜索引擎：bing | so | baidu
   */
  async function tryHtml(source: "bing" | "so" | "baidu") {
    let url = ""
    let pattern: RegExp
    // 统一 UA，降低被封概率
    const UA = { headers: { "User-Agent": "aiagent/0.1", Accept: "text/html" } }

    if (source === "bing") {
      // Bing 搜索接口
      url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`
      // 匹配结果块：标题链接 + 摘要
      pattern = /<li class=\"b_algo\">[\s\S]*?<h2>\s*<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
    } else if (source === "so") {
      // 360 搜索接口
      url = `https://www.so.com/s?q=${encodeURIComponent(query)}&num=${limit}`
      pattern = /<h3[^>]*res-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*res-desc[^>]*>([\s\S]*?)<\/p>/gi
    } else {
      // 百度搜索接口
      url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`
      pattern = /<h3[^>]*c-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]*c-abstract[^>]*>([\s\S]*?)<\/div>/gi
    }

    const resp = await fetch(url, UA)
    if (!resp.ok) return [] as Array<{ title: string; url: string; snippet: string }>

    const html = await resp.text()
    const items: Array<{ title: string; url: string; snippet: string }> = []
    let m: RegExpExecArray | null
    // 循环提取，直到达到 limit
    while ((m = pattern.exec(html)) && items.length < limit) {
      const href = m[1]
      const title = String(m[2]).replace(/<[^>]+>/g, " ").trim() // 去标签
      const snippet = String(m[3]).replace(/<[^>]+>/g, " ").trim()
      items.push({ title, url: href, snippet })
    }
    return items
  }

  // 优先级：bing -> 360 -> 百度
  let items = await tryHtml("bing")
  if (items.length === 0) items = await tryHtml("so")
  if (items.length === 0) items = await tryHtml("baidu")
  return items
}

/**
 * POST /api/rag/stream
 * 接收 { query, limit, temperature } 返回 SSE 流
 */
export async function POST(req: NextRequest) {
  // 检查环境变量
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey)
    return new Response(JSON.stringify({ error: "DEEPSEEK_API_KEY missing" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })

  // 解析请求体
  const body = (await req.json().catch(() => ({}))) as any
  const query = String(body?.query ?? "").trim()
  const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 5))) // 限制 1-10
  const temperature = Number(body?.temperature ?? 0)

  if (!query)
    return new Response(JSON.stringify({ error: "missing_query" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })

  // 抓取搜索结果
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  const reqId = crypto.randomUUID()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/stream", status: "started", meta: { query_len: query.length, limit } })
  const items = await searchHtml(query, limit)
  // 拼接成“证据”文本
  const evidence = items.map((it, i) => `[${i + 1}] ${it.title}\n${it.snippet}\n${it.url}`).join("\n\n")

  // 系统提示词
  const sys = [
    "你是检索增强回答助手。",
    "根据提供的检索片段回答用户问题，用简洁的中文要点形式作答。",
    "在引用处以 [编号] 标注来源，编号对应提供的片段列表。",
    "若信息不足，直接说明需要更多信息，不要编造。"
  ].join("\n")

  // 用户提示词
  const user = [`问题：${query}`, "检索片段：", evidence || "(无片段)"].join("\n\n")

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // 发送 SSE 事件辅助函数
      function send(event: string, data: any) {
        const payload = typeof data === "string" ? data : JSON.stringify(data)
        controller.enqueue(encoder.encode(`event: ${event}\n`))
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      }

      // 先推送引用列表
      send("citations", { items })

      // 请求 DeepSeek 流式接口
      const t0 = Date.now()
      let resp: Response
      try {
        resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: user }
            ],
            temperature,
            stream: true
          })
        })
      } catch (e: any) {
        send("error", "network_error")
        send("done", "ok")
        appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/stream", status: "error", error: e?.message ?? String(e) })
        controller.close()
        return
      }

      if (!resp.body) {
        send("error", "no_stream")
        send("done", "ok")
        appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/stream", status: "error", error: "no_stream" })
        controller.close()
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      // 逐块读取 SSE 数据
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const parts = buf.split("\n\n")
        buf = parts.pop() || "" // 剩余不完整片段

        for (const part of parts) {
          const lines = part.split("\n").filter(Boolean)
          let ev = "message"
          for (const line of lines) {
            if (line.startsWith("event:")) ev = line.slice(6).trim()
            if (line.startsWith("data:")) {
              const ds = line.slice(5).trim()
              if (ds === "[DONE]") {
                send("done", "ok")
                controller.close()
                return
              } else {
                try {
                  const j = JSON.parse(ds)
                  const token = j?.choices?.[0]?.delta?.content
                  if (typeof token === "string" && token.length > 0) send("token", token)
                } catch {
                  // 忽略非 JSON 行
                }
              }
            }
          }
        }
      }

      // 正常结束
      send("done", "ok")
      appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "assistant_reply", route: "/api/rag/stream", status: "ok", duration_ms: Date.now() - t0, meta: { items_count: items.length } })
      controller.close()
    }
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }
  })
}