import { describe, it, expect } from "vitest"
import { validateRequired, requireDeepseekKey } from "../app/lib/env"

describe("env validate", () => {
  it("detects missing keys", () => {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const res = validateRequired(["DEEPSEEK_API_KEY"])
    expect(res.ok).toBe(false)
    expect(res.missing).toContain("DEEPSEEK_API_KEY")
    if (old !== undefined) process.env.DEEPSEEK_API_KEY = old
  })

  it("requireDeepseekKey throws when missing", () => {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    expect(() => requireDeepseekKey()).toThrowError(/DEEPSEEK_API_KEY/)
    if (old !== undefined) process.env.DEEPSEEK_API_KEY = old
  })
})
