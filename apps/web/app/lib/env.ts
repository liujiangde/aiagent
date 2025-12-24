// 新增 apps/web/app/lib/env.ts:1-8 ，统一读取并修剪 DEEPSEEK_API_KEY 。
export function getEnv(key: string) {
  const v = process.env[key] || ""
  return v.trim()
}

export function getDeepseekKey() {
  return getEnv("DEEPSEEK_API_KEY")
}

export function validateRequired(keys: string[]) {
  const missing = keys.filter((k) => getEnv(k).length === 0)
  return { ok: missing.length === 0, missing }
}

export function requireDeepseekKey() {
  const k = getDeepseekKey()
  if (!k) throw new Error("DEEPSEEK_API_KEY missing")
  return k
}
