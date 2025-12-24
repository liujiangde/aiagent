import { describe, it, expect } from "vitest"
import { getDeepseekKey } from "../app/lib/env"

describe("env helper", () => {
  it("returns empty string when missing", () => {
    const old = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    expect(getDeepseekKey()).toBe("")
    if (old !== undefined) process.env.DEEPSEEK_API_KEY = old
  })

  it("trims the value", () => {
    process.env.DEEPSEEK_API_KEY = "  abc  "
    expect(getDeepseekKey()).toBe("abc")
  })
})
