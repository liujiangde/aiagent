import { NextResponse } from "next/server"

export async function GET() {
  const key = process.env.DEEPSEEK_API_KEY
  const hasKey = !!key && key.trim().length > 0
  const length = hasKey ? key!.length : 0
  return NextResponse.json({ hasKey, length })
}