import { NextResponse } from "next/server"
import { validateRequired, getDeepseekKey } from "../../lib/env"

export async function GET() {
  const key = getDeepseekKey()
  const hasKey = !!key && key.trim().length > 0
  const length = hasKey ? key!.length : 0
  const check = validateRequired(["DEEPSEEK_API_KEY"])
  return NextResponse.json({
    ok: check.ok,
    missing: check.missing,
    keys: { DEEPSEEK_API_KEY: hasKey, length }
  })
}
