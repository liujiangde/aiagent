/**
 * 简易文件日志与会话持久化工具（开发环境）
 * - 仅在 Node 运行时写本地文件；生产如为无状态环境需替换外部存储
 * - JSONL 按行追加，避免并发破碎；会话快照为覆盖写
 */
import fs from "node:fs"
import path from "node:path"

// 统一在仓库根目录下创建 .data/web 用于开发环境持久化
const ROOT = process.env.LOG_ROOT && process.env.LOG_ROOT.trim().length > 0 ? process.env.LOG_ROOT : process.cwd()
const DATA_DIR = path.resolve(ROOT, ".data/web")
const LOG_FILE = path.resolve(DATA_DIR, "logs.jsonl")
const SESS_DIR = path.resolve(DATA_DIR, "sessions")

/**
 * 判断是否可进行文件写入（非 Edge 运行时）
 */
export function canWrite() {
  return typeof process !== "undefined" && process.release?.name === "node"
}

/**
 * 确保日志与会话目录存在
 */
export function ensureDirs() {
  if (!canWrite()) return
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true })
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "")
}

/**
 * 追加 JSON 行到日志文件
 */
export function appendLog(entry: Record<string, any>) {
  if (!canWrite()) return
  ensureDirs()
  const safe = JSON.stringify(entry) + "\n"
  fs.appendFileSync(LOG_FILE, safe)
}

/**
 * 写入/更新会话快照
 */
export function writeSessionSnapshot(sessionId: string, snapshot: Record<string, any>) {
  if (!canWrite() || !sessionId) return
  ensureDirs()
  const file = path.resolve(SESS_DIR, `${sessionId}.json`)
  const body = JSON.stringify({ session_id: sessionId, ...snapshot }, null, 2)
  fs.writeFileSync(file, body)
}

/**
 * 从请求头获取会话 ID；若不存在则返回空字符串（由调用方决定策略）
 */
export function getSessionIdFromHeaders(h: Headers) {
  const raw = h.get("x-session-id") || ""
  return raw.trim()
}
