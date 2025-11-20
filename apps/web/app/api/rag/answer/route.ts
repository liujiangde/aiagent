import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders } from "../../../lib/logger"

async function searchHtml(query: string, limit: number) {
  async function tryHtml(source: "bing" | "so" | "baidu") {
    let url = ""
    let pattern: RegExp
    const UA = { headers: { "User-Agent": "aiagent/0.1", "Accept": "text/html" } }
    if (source === "bing") {
      url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`
      pattern = /<li class=\"b_algo\">[\s\S]*?<h2>\s*<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
    } else if (source === "so") {
      url = `https://www.so.com/s?q=${encodeURIComponent(query)}&num=${limit}`
      pattern = /<h3[^>]*res-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*res-desc[^>]*>([\s\S]*?)<\/p>/gi
    } else {
      url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`
      pattern = /<h3[^>]*c-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]*c-abstract[^>]*>([\s\S]*?)<\/div>/gi
    }
    const resp = await fetch(url, UA)
    if (!resp.ok) return [] as Array<{ title: string; url: string; snippet: string }>
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
  return items
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: "DEEPSEEK_API_KEY missing" }, { status: 400 })
  const body = await req.json().catch(() => ({})) as any
  const query = String(body?.query ?? "").trim()
  const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 5)))
  const temperature = Number(body?.temperature ?? 0)
  if (!query) return NextResponse.json({ error: "missing_query" }, { status: 400 })
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  const reqId = crypto.randomUUID()
  const t0 = Date.now()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/answer", status: "started", meta: { query_len: query.length, limit } })

  const items = await searchHtml(query, limit)
  const evidence = items.map((it, i) => `[${i + 1}] ${it.title}\n${it.snippet}\n${it.url}`).join("\n\n")
  const sys = [
    "你是检索增强回答助手。",
    "根据提供的检索片段回答用户问题，用简洁的中文要点形式作答。",
    "在引用处以 [编号] 标注来源，编号对应提供的片段列表。",
    "若信息不足，直接说明需要更多信息，不要编造。"
  ].join("\n")
  const user = [
    `问题：${query}`,
    "检索片段：",
    evidence || "(无片段)"
  ].join("\n\n")

  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature })
  })
  if (!resp.ok) {
    const err = await resp.text().catch(() => "")
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/answer", status: "error", error: err, duration_ms: Date.now() - t0 })
    return NextResponse.json({ error: "upstream_error", detail: err }, { status: 502 })
  }
  const data = await resp.json()
  const answer = data?.choices?.[0]?.message?.content ?? ""
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "assistant_reply", route: "/api/rag/answer", status: "ok", duration_ms: Date.now() - t0, meta: { items_count: items.length } })
  return NextResponse.json({ query, items, answer })
}