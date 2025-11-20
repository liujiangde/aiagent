/**
 * GET /api/metrics/summary
 *
 * 读取开发环境 JSONL 日志，汇总关键指标：
 * - 路由调用次数、平均耗时
 * - Planner 命中率（kb_hit）与上下文长度分布
 * - DeepSeek 代理平均耗时
 */
import { NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

const DATA_DIR = path.resolve(process.cwd(), ".data/web")
const LOG_FILE = path.resolve(DATA_DIR, "logs.jsonl")

type Entry = { route?: string; type?: string; duration_ms?: number; meta?: any }

export async function GET() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return NextResponse.json({ routes: {}, totals: { logs: 0 } })
    }
    const raw = fs.readFileSync(LOG_FILE, "utf8")
    const lines = raw.split(/\n+/).filter(Boolean)
    let logs = 0
    let plannerCalls = 0
    let plannerDurSum = 0
    let plannerKbHit = 0
    const ctxLens: number[] = []
    let deepCalls = 0
    let deepDurSum = 0

    for (const line of lines) {
      let j: Entry
      try { j = JSON.parse(line) } catch { continue }
      logs++
      if (j.route === "/api/agent/plan_execute" && j.type === "assistant_reply") {
        plannerCalls++
        plannerDurSum += Number(j.duration_ms ?? 0)
        if (j.meta?.kb_hit) plannerKbHit++
        const ctx = Number(j.meta?.context_chars ?? 0)
        if (ctx > 0) ctxLens.push(ctx)
      }
      if (j.route === "/api/deepseek" && j.type === "assistant_reply") {
        deepCalls++
        deepDurSum += Number(j.duration_ms ?? 0)
      }
    }

    const avg = (sum: number, cnt: number) => (cnt > 0 ? Math.round(sum / cnt) : 0)
    const ctxStats = (() => {
      if (ctxLens.length === 0) return { count: 0, avg: 0, p95: 0 }
      const sorted = ctxLens.slice().sort((a, b) => a - b)
      const avgLen = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
      const p95 = sorted[Math.floor(sorted.length * 0.95) - 1] || sorted[sorted.length - 1]
      return { count: sorted.length, avg: avgLen, p95 }
    })()

    const routes = {
      "/api/agent/plan_execute": {
        calls: plannerCalls,
        avg_duration_ms: avg(plannerDurSum, plannerCalls),
        kb_hit_rate: plannerCalls > 0 ? Number((plannerKbHit / plannerCalls).toFixed(3)) : 0,
        context_len: ctxStats
      },
      "/api/deepseek": {
        calls: deepCalls,
        avg_duration_ms: avg(deepDurSum, deepCalls)
      }
    }

    return NextResponse.json({ routes, totals: { logs } })
  } catch (e: any) {
    return NextResponse.json({ error: "metrics_error", detail: e?.message ?? String(e) }, { status: 500 })
  }
}