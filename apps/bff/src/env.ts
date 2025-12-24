/**
 * BFF 环境变量加载与读取工具
 * - 加载顺序：先加载 apps/bff/.env（默认），再加载 apps/bff/.env.local（覆盖）
 * - 提供方法：loadEnv() 初始化环境；getPort() 获取服务端口；getDeepseekKey() 获取 DEEPSEEK_API_KEY
 * - 说明：.env.local 适用于本地开发密钥与配置，已被 .gitignore 忽略，避免泄露
 */
import dotenv from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * 初始化环境变量加载：
 * - 以当前模块目录解析应用根（apps/bff）
 * - 依次加载 .env 与 .env.local，其中 .env.local 使用 override:true 进行覆盖
 */
export function loadEnv() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const appRoot = path.resolve(__dirname, "..")
  dotenv.config({ path: path.resolve(appRoot, ".env"), override: false })
  dotenv.config({ path: path.resolve(appRoot, ".env.local"), override: true })
}

/**
 * 获取服务监听端口：
 * - 默认 4000
 * - 可通过环境变量 PORT 覆盖
 */
export function getPort() {
  const raw = process.env.PORT || "4000"
  const n = parseInt(raw)
  return Number.isFinite(n) && n > 0 ? n : 4000
}

/**
 * 获取 Deepseek API 密钥：
 * - 从环境变量读取并进行去空格处理
 * - 若无有效值则返回 null
 */
export function getDeepseekKey(): string | null {
  const v = (process.env.DEEPSEEK_API_KEY || "").trim()
  return v ? v : null
}
