/**
 * DeepSeek 安全代理路由
 *
 * 目的：仅在服务端读取 `DEEPSEEK_API_KEY`，将前端请求安全转发到 DeepSeek Chat Completions，避免在浏览器暴露密钥。
 *
 * 路径与方法：
 * - GET /api/deepseek    返回密钥是否存在：{ hasKey: boolean }
 * - POST /api/deepseek   代理对话请求，返回模型与文本：{ model: string, content: string }
 *
 * 环境变量：
 * - DEEPSEEK_API_KEY     DeepSeek 平台的 API Key，仅服务器端读取
 *
 * 请求体（POST）：
 * {
 *   model?: string                // 默认 "deepseek-chat"
 *   messages: Array<{ role: "user"|"system"|"assistant", content: string }>
 *   temperature?: number          // 默认 0
 * }
 *
 * 错误语义：
 * - 400 { error: "DEEPSEEK_API_KEY missing" }         // 未配置密钥
 * - 502 { error: "upstream_error", detail: string }   // 上游 DeepSeek 返回错误
 *
 * 安全说明：
 * - 切勿在客户端代码中读取或下发 `DEEPSEEK_API_KEY`；该路由仅在服务器端访问环境变量。
 */
import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendLog, writeSessionSnapshot, getSessionIdFromHeaders } from "../../lib/logger"

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

/**
 * 健康检查：返回是否已配置密钥
 */
export async function GET() {
  const key = process.env.DEEPSEEK_API_KEY
  const hasKey = !!key && key.trim().length > 0
  appendLog({ ts: new Date().toISOString(), app: "web", type: "api_call", route: "/api/deepseek", method: "GET", status: "ok" })
  return NextResponse.json({ hasKey })
}

/**
 * 对话代理：将请求体转发至 DeepSeek Chat Completions，并返回文本内容
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: "DEEPSEEK_API_KEY missing" }, { status: 400 })

  const body = await req.json().catch(() => ({})) as any
  const messages = body?.messages ?? [{ role: "user", content: "Hello" }]
  const model = body?.model ?? "deepseek-chat"
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  const reqId = crypto.randomUUID()
  const t0 = Date.now()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/deepseek", model, status: "started" })

  const resp = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: body?.temperature ?? 0,
      stream: false
    })
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => "")
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "api_call", route: "/api/deepseek", model, status: "error", error: err, duration_ms: Date.now() - t0 })
    return NextResponse.json({ error: "upstream_error", detail: err }, { status: 502 })
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? ""
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, request_id: reqId, type: "assistant_reply", route: "/api/deepseek", model, status: "ok", duration_ms: Date.now() - t0 })
  writeSessionSnapshot(sessionId, { last_updated_at: new Date().toISOString(), messages, last_reply: content })
  return NextResponse.json({ model, content })
}