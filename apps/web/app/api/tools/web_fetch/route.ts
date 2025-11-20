import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendLog, getSessionIdFromHeaders } from "../../lib/logger"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const url = String(body?.url ?? "")
  if (!url) return NextResponse.json({ error: "missing_url" }, { status: 400 })
  const sessionId = getSessionIdFromHeaders(req.headers) || crypto.randomUUID()
  appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "tool_run", route: "/api/tools/web_fetch", status: "started", meta: { url_len: url.length } })
  let u: URL
  try { u = new URL(url) } catch { return NextResponse.json({ error: "invalid_url" }, { status: 400 }) }
  if (!(u.protocol === "http:" || u.protocol === "https:")) return NextResponse.json({ error: "unsupported_protocol" }, { status: 400 })
  const host = u.hostname.toLowerCase()
  if (host === "localhost" || host.startsWith("127.") || host === "::1") return NextResponse.json({ error: "forbidden_host" }, { status: 400 })
  const timeout = Number.isFinite(Number(body?.timeout_ms)) ? Number(body?.timeout_ms) : 10000
  const maxBytes = Number.isFinite(Number(body?.max_bytes)) ? Number(body?.max_bytes) : 100000
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
    appendLog({ ts: new Date().toISOString(), app: "web", session_id: sessionId, type: "tool_run", route: "/api/tools/web_fetch", status: "ok", meta: { status, contentType } })
    return NextResponse.json({ url, status, contentType, text: truncated })
  } finally {
    clearTimeout(t)
  }
}