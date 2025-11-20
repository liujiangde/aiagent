import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders } from "../../../lib/logger"

/**
 * POST /api/tools/search
 * 接收 JSON 请求体 { query: string, limit?: number }
 * 依次尝试 Bing → 360 → 百度 抓取搜索结果
 * 返回 { query, items: Array<{title,url,snippet}> }
 */
export async function POST(req: NextRequest) {
  // 解析请求体，容错空对象
  const body = await req.json().catch(() => ({})) as any
  // 提取并清洗查询词
  const query = String(body?.query ?? "").trim()
  // 限制 limit 在 1~10 之间，默认 5
  const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 5)))
  // 查询词为空直接返回 400
  if (!query) return NextResponse.json({ error: "missing_query" }, { status: 400 })

  // 从请求头获取 sessionId，若无则生成
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  // 记录开始日志
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "tool_run", route: "/api/tools/search", status: "started", meta: { query_len: query.length, limit } })

  /**
   * 按指定搜索引擎抓取 HTML 结果
   * @param source 搜索引擎：bing | so | baidu
   * @returns 搜索结果数组，失败返回空数组
   */
  async function tryHtml(source: "bing" | "so" | "baidu") {
    let url = ""
    let pattern: RegExp
    // 统一 UA，伪装为简单爬虫
    const UA = { headers: { "User-Agent": "aiagent/0.1", "Accept": "text/html" } }

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

    try {
      const resp = await fetch(url, UA)
      if (!resp.ok) return [] as Array<{ title: string; url: string; snippet: string }>

      const html = await resp.text()
      const items: Array<{ title: string; url: string; snippet: string }> = []
      let m: RegExpExecArray | null
      // 循环提取结果，最多 limit 条
      while ((m = pattern.exec(html)) && items.length < limit) {
        const href = m[1]
        // 去除标签保留纯文本
        const title = String(m[2]).replace(/<[^>]+>/g, " ").trim()
        const snippet = String(m[3]).replace(/<[^>]+>/g, " ").trim()
        items.push({ title, url: href, snippet })
      }
      return items
    } catch (e: any) {
      // 抓取失败记录错误日志
      appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "tool_run", route: "/api/tools/search", status: "error", error: e?.message ?? String(e) })
      return []
    }
  }

  try {
    // 优先 Bing，失败则降级 360，再失败则百度
    let items = await tryHtml("bing")
    if (items.length === 0) items = await tryHtml("so")
    if (items.length === 0) items = await tryHtml("baidu")

    // 记录成功日志
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "tool_run", route: "/api/tools/search", status: "ok", meta: { items_count: items.length } })
    return NextResponse.json({ query, items })
  } catch (e: any) {
    // 兜底异常记录
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "tool_run", route: "/api/tools/search", status: "error", error: e?.message ?? String(e) })
    return NextResponse.json({ query, items: [] })
  }
}