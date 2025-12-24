import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { ensureDirs, appendLog } from "../app/lib/logger"

describe("logger local file persistence", () => {
  it("creates .data/web directories and log file", () => {
    ensureDirs()
    const dataDir = path.resolve(process.cwd(), ".data/web")
    const sessDir = path.resolve(dataDir, "sessions")
    const logFile = path.resolve(dataDir, "logs.jsonl")
    expect(fs.existsSync(dataDir)).toBe(true)
    expect(fs.existsSync(sessDir)).toBe(true)
    expect(fs.existsSync(logFile)).toBe(true)
  })

  it("appends a JSON line to logs.jsonl", () => {
    const logFile = path.resolve(process.cwd(), ".data/web/logs.jsonl")
    const before = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : ""
    appendLog({ type: "test_entry", ok: true })
    const after = fs.readFileSync(logFile, "utf8")
    expect(after.length).toBeGreaterThan(before.length)
    const lastLine = after.trim().split("\n").pop() || ""
    const parsed = JSON.parse(lastLine)
    expect(parsed.type).toBe("test_entry")
    expect(parsed.ok).toBe(true)
  })
})
