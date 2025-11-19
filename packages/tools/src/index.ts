import fs from "node:fs"
import path from "node:path"

// 工具调用结构：包含工具名称和参数
export type ToolCall = { tool: string; args: Record<string, any> }

// 工具定义：名称和异步执行函数
export type Tool = {
  name: string
  run: (args: Record<string, any>) => Promise<any>
}

// 工具注册表：键为工具名，值为工具对象
export type ToolRegistry = Record<string, Tool>

/**
 * 从文本中解析工具调用
 * 优先匹配 >>>TOOL: 开头的 JSON，其次尝试直接解析整段文本
 */
export function parseToolCall(text: string): ToolCall | null {
  const m = text.match(/>>>TOOL:\s*(\{[\s\S]*\})/)
  if (m) {
    try {
      const obj = JSON.parse(m[1])
      if (obj && typeof obj.tool === "string" && typeof obj.args === "object") return obj as ToolCall
    } catch {}
  }
  try {
    const obj = JSON.parse(text)
    if (obj && typeof obj.tool === "string" && typeof obj.args === "object") return obj as ToolCall
  } catch {}
  return null
}

/**
 * 根据注册表执行工具调用
 * 若工具不存在则抛出 unknown_tool 错误
 */
export async function executeTool(registry: ToolRegistry, call: ToolCall): Promise<any> {
  const t = registry[call.tool]
  if (!t) throw new Error("unknown_tool")
  return t.run(call.args ?? {})
}

/**
 * 返回内置工具注册表
 * 包含 now、calc、read_file 三个工具
 */
export function builtinTools(): ToolRegistry {
  // 文档根目录，限制文件读取范围
  const baseDocs = path.resolve(__dirname, "../../../文档")
  return {
    // 获取当前 ISO 时间
    now: {
      name: "now",
      run: async () => ({ iso: new Date().toISOString() })
    },
    // 安全计算表达式，仅允许数字与运算符
    calc: {
      name: "calc",
      run: async (args) => {
        const expr = String(args?.expr ?? "")
        if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error("invalid_expr")
        // eslint-disable-next-line no-new-func
        const val = Function(`return (${expr})`)()
        return { result: val }
      }
    },
    // 读取指定路径的文本文件，禁止越界访问
    read_file: {
      name: "read_file",
      run: async (args) => {
        const rel = String(args?.path ?? "")
        if (!rel || rel.includes("..")) throw new Error("invalid_path")
        const full = path.resolve(baseDocs, rel)
        if (!full.startsWith(baseDocs)) throw new Error("forbidden")
        const txt = fs.readFileSync(full, "utf8")
        return { content: txt }
      }
    }
  }
}

/**
 * 生成系统提示文本，告知模型可用工具及调用格式
 */
export function toolSystemPrompt(registry: ToolRegistry): string {
  const names = Object.keys(registry)
  return [
    "你可以调用工具。当需要工具时，严格输出一行以 >>>TOOL: 开头的 JSON，格式",
    "{ \"tool\": string, \"args\": object }",
    `可用工具: ${names.join(", ")}`,
    "若无需工具，输出正常回答文本。"
  ].join("\n")
}