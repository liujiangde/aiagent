/**
 * POST /api/kb/search
 * - 语义检索知识库，返回 Top‑k 片段
 */
import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders } from "../../../lib/logger"
import * as kb from "@aiagent/retrieval"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const query = String(body?.query ?? "").trim()
  const k = Math.max(1, Math.min(10, Number(body?.k ?? 5)))
  if (!query) return NextResponse.json({ error: "missing_query" }, { status: 400 })
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "api_call", route: "/api/kb/search", status: "started", meta: { query_len: query.length, k } })
  const res = kb.search({ query, k })
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "assistant_reply", route: "/api/kb/search", status: "ok", meta: { items_count: res.items?.length ?? 0 } })
  return NextResponse.json(res)
}