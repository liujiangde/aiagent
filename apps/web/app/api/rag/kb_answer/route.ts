/**
 * POST /api/rag/kb_answer
 * - 以知识库片段作为检索证据，调用 DeepSeek 生成带引用的回答
 * - 需要服务端环境变量 `DEEPSEEK_API_KEY`
 */
import { NextRequest, NextResponse } from "next/server"
import * as kb from "@aiagent/retrieval"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders } from "../../../lib/logger"
import { getDeepseekKey } from "../../../lib/env"

export async function POST(req: NextRequest) {
  const apiKey = getDeepseekKey()
  if (!apiKey) return NextResponse.json({ error: "DEEPSEEK_API_KEY missing" }, { status: 400 })
  const body = await req.json().catch(() => ({})) as any
  const query = String(body?.query ?? "").trim()
  const k = Math.max(1, Math.min(10, Number(body?.k ?? 5)))
  const temperature = Number(body?.temperature ?? 0)
  if (!query) return NextResponse.json({ error: "missing_query" }, { status: 400 })
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  const reqId = crypto.randomUUID()
  const t0 = Date.now()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/kb_answer", status: "started", meta: { query_len: query.length, k } })

  const res = kb.search({ query, k })
  const items = res.items
  const evidence = items.map((it, i) => `[${i + 1}] ${it.title || "(无标题)"}\n${it.text}`).join("\n\n")
  const sys = [
    "你是知识库检索增强助手。",
    "基于提供的知识库片段回答用户问题，用简洁要点作答。",
    "在引用处以 [编号] 标注来源，编号对应提供的片段列表。",
    "若信息不足，直接说明需要更多信息，不要编造。"
  ].join("\n")
  const user = [`问题：${query}`, "片段：", evidence || "(无片段)"].join("\n\n")

  let resp: Response
  try {
    resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature })
    })
  } catch (e: any) {
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/kb_answer", status: "error", error: e?.message ?? String(e), duration_ms: Date.now() - t0 })
    return NextResponse.json({ error: "network_error", detail: e?.message ?? String(e) }, { status: 502 })
  }
  if (!resp.ok) {
    const err = await resp.text().catch(() => "")
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/rag/kb_answer", status: "error", error: err, duration_ms: Date.now() - t0 })
    return NextResponse.json({ error: "upstream_error", detail: err }, { status: 502 })
  }
  const data = await resp.json()
  const answer = data?.choices?.[0]?.message?.content ?? ""
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "assistant_reply", route: "/api/rag/kb_answer", status: "ok", duration_ms: Date.now() - t0, meta: { items_count: items.length } })
  return NextResponse.json({ query, items, answer })
}
