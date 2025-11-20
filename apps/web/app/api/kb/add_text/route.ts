/**
 * POST /api/kb/add_text
 * - 将纯文本切分入库，生成向量并持久化到索引
 * GET /api/kb/add_text
 * - 返回当前索引统计信息
 */
import { NextRequest, NextResponse } from "next/server"
import * as kb from "@aiagent/retrieval"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders, writeSessionSnapshot } from "../../../lib/logger"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const title = String(body?.title ?? "")
  const text = String(body?.text ?? "")
  if (!text || text.length < 10) return NextResponse.json({ error: "text_too_short" }, { status: 400 })
  if (text.length > 200_000) return NextResponse.json({ error: "text_too_long" }, { status: 400 })
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "api_call", route: "/api/kb/add_text", status: "started", meta: { title_len: title.length, text_len: text.length } })
  const out = kb.addDocument({ title, text })
  const st = kb.stats()
  writeSessionSnapshot(sessionId, { last_updated_at: new Date().toISOString(), last_added: { docId: out.docId, added: out.added } })
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "assistant_reply", route: "/api/kb/add_text", status: "ok", meta: { added: out.added } })
  return NextResponse.json({ added: out.added, docId: out.docId, stats: st })
}

export async function GET() {
  return NextResponse.json(kb.stats())
}