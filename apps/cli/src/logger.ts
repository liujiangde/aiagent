/**
 * CLI 端 JSONL 文件日志工具
 * - 每会话一个日志文件：apps/cli/memory/logs/<sessionId>.jsonl
 */
import fs from "node:fs"
import path from "node:path"

// 以编译后 dist 目录为参考，定位到 apps/cli/memory/logs
const LOG_ROOT = path.resolve(__dirname, "../memory/logs")

/**
 * 确保日志根目录存在
 */
export function ensureSessionLog(sessionId: string) {
  if (!fs.existsSync(LOG_ROOT)) fs.mkdirSync(LOG_ROOT, { recursive: true })
  const file = path.resolve(LOG_ROOT, `${sessionId}.jsonl`)
  if (!fs.existsSync(file)) fs.writeFileSync(file, "")
}

/**
 * 追加一行日志到会话日志文件
 */
export function append(sessionId: string, entry: Record<string, any>) {
  ensureSessionLog(sessionId)
  const file = path.resolve(LOG_ROOT, `${sessionId}.jsonl`)
  fs.appendFileSync(file, JSON.stringify(entry) + "\n")
}