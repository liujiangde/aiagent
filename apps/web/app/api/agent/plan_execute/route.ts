/**
 * POST /api/agent/plan_execute
 *
 * 最小 Planner‑Executor 控制环：
 * 1) 优先尝试知识库检索（kb_search），若命中则基于上下文生成回答；
 * 2) 否则进行网页搜索（search）与抓取（web_fetch），汇总上下文生成回答；
 * 3) 记录完整执行轨迹与耗时指标，并返回 final_answer、used_tools、trace、metrics。
 */
import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendLog, writeSessionSnapshot, getSessionIdFromHeaders } from "../../../lib/logger"
import { builtinTools, executeTool } from "@aiagent/tools"
import * as kb from "@aiagent/retrieval"

type TraceStep = { step: string; detail?: Record<string, any>; duration_ms?: number }

/**
 * 简易回答生成：优先调用 /api/deepseek；若不可用则使用基于上下文的规则摘要
 */
async function generateAnswer(sessionId: string, prompt: string, context: string): Promise<{ content: string; model: string; used_llm: boolean }> {
  try {
    const hc = await fetch("http://localhost:3000/api/deepseek")
    const hj = await hc.json().catch(() => ({}))
    if (hj?.hasKey) {
      const messages = [
        { role: "system", content: "你是一个助理，基于提供的上下文准确回答用户问题。若上下文没有答案，明确说明未找到。" },
        { role: "user", content: `问题：${prompt}\n上下文：\n${context}` }
      ]
      const resp = await fetch("http://localhost:3000/api/deepseek", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify({ messages, temperature: 0 })
      })
      if (resp.ok) {
        const dj = await resp.json()
        return { content: String(dj?.content ?? ""), model: String(dj?.model ?? "deepseek-chat"), used_llm: true }
      }
    }
  } catch {}
  const trimmed = context.replace(/\s+/g, " ").trim()
  const short = trimmed.length > 800 ? trimmed.slice(0, 800) + "..." : trimmed
  const fallback = `基于当前上下文的要点：\n${short}\n——以上为依据的内容摘要。若需更详细答案，请提供更具体问题或开启模型。`
  return { content: fallback, model: "rule-based", used_llm: false }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const body = await req.json().catch(() => ({})) as any
  const prompt = String(body?.prompt ?? "").trim()
  if (!prompt) return NextResponse.json({ error: "missing_prompt" }, { status: 400 })
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  const requestId = crypto.randomUUID()

  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: requestId, type: "api_call", route: "/api/agent/plan_execute", status: "started", meta: { prompt_len: prompt.length } })

  const tools = builtinTools()
  const trace: TraceStep[] = []
  const used_tools: Array<{ tool: string; args: Record<string, any>; duration_ms: number }> = []
  let context = ""
  let kb_hit = false
  let top_score = 0

  // Step 1: KB 检索
  {
    const s0 = Date.now()
    const res = kb.search({ query: prompt, k: 5 })
    const d = Date.now() - s0
    trace.push({ step: "kb_search", detail: { items: res.items?.length ?? 0 }, duration_ms: d })
    used_tools.push({ tool: "kb_search", args: { query: prompt, k: 5 }, duration_ms: d })
    if (res.items && res.items.length > 0) {
      kb_hit = true
      top_score = Number(res.items[0]?.score ?? 0)
      if (top_score >= 0.6) {
        context = res.items.map(it => `【${it.title || it.docId}】\n${it.text}`).join("\n\n")
      }
    }
  }

  // Step 2: 搜索与抓取（若 KB 未命中或分数较低）
  if (!context) {
    const s1 = Date.now()
    let searchRes: any = {}
    try {
      searchRes = await executeTool(tools, { tool: "search", args: { query: prompt, limit: 5 } })
    } catch {}
    const d1 = Date.now() - s1
    trace.push({ step: "search", detail: { items: Array.isArray(searchRes?.items) ? searchRes.items.length : 0 }, duration_ms: d1 })
    used_tools.push({ tool: "search", args: { query: prompt, limit: 5 }, duration_ms: d1 })

    const first = Array.isArray(searchRes?.items) ? searchRes.items[0] : null
    if (first?.url) {
      const s2 = Date.now()
      let fetchRes: any = {}
      try {
        fetchRes = await executeTool(tools, { tool: "web_fetch", args: { url: first.url, timeout_ms: 10000, max_bytes: 100000 } })
      } catch {}
      const d2 = Date.now() - s2
      trace.push({ step: "web_fetch", detail: { status: fetchRes?.status, contentType: fetchRes?.contentType }, duration_ms: d2 })
      used_tools.push({ tool: "web_fetch", args: { url: first.url }, duration_ms: d2 })
      if (typeof fetchRes?.text === "string" && fetchRes.text.trim()) {
        context = `来源：${first.title || first.url}\n${fetchRes.text}`
      }
    }
  }

  // Step 3: 生成回答（模型或规则）
  const a0 = Date.now()
  const answer = await generateAnswer(sessionId, prompt, context || "（未获取到上下文）")
  const aDur = Date.now() - a0
  trace.push({ step: "answer", detail: { model: answer.model, used_llm: answer.used_llm }, duration_ms: aDur })

  const metrics = {
    total_duration_ms: Date.now() - t0,
    context_chars: (context || "").length,
    kb_hit,
    top_score: Number(top_score.toFixed?.(6) ?? top_score)
  }

  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: requestId, type: "assistant_reply", route: "/api/agent/plan_execute", status: "ok", meta: { kb_hit, top_score: metrics.top_score, context_chars: metrics.context_chars }, duration_ms: metrics.total_duration_ms })
  writeSessionSnapshot(sessionId, { last_updated_at: new Date().toISOString(), last_prompt: prompt, last_reply: answer.content, last_trace: trace })

  return NextResponse.json({ final_answer: answer.content, used_tools, trace, metrics })
}