import readline from "node:readline"
import crypto from "node:crypto"
import { append as logAppend, ensureSessionLog } from "./logger"
const toolsMod = require("../../../packages/tools/dist/index.js")
const { builtinTools, executeTool, parseToolCall, toolSystemPrompt } = toolsMod

// 定义聊天消息的类型，角色可以是 user、system 或 assistant
type ChatMessage = { role: "user" | "system" | "assistant"; content: string }

/**
 * 调用 Deepseek API 进行对话
 * @param messages 聊天历史消息数组
 * @param model 使用的模型，默认为 "deepseek-chat"
 * @param temperature 控制生成随机性，默认为 0
 * @returns 返回助手的回复内容
 */
async function callDeepseek(messages: ChatMessage[], model = "deepseek-chat", temperature = 0) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing")
  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature })
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "")
    throw new Error(`upstream_error: ${txt}`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? ""
  return content as string
}

/**
 * 主函数：启动 CLI 聊天循环
 */
async function main() {
  // 创建 readline 接口，用于读取用户输入
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  // 存储聊天历史
  const messages: ChatMessage[] = []
  const tools = builtinTools()
  const sessionId = crypto.randomUUID()
  ensureSessionLog(sessionId)
  console.log("AI Agent CLI. 输入内容后回车，输入 /exit 退出。")
  // 定义递归函数，持续询问用户输入
  const ask = () => {
    if ((rl as any).closed) return
    rl.question("> ", async (line: string) => {
    // 如果用户输入 /exit，关闭接口并退出
    if (line.trim() === "/exit") { rl.close(); return }
    if (line.startsWith("/tool ")) {
      try {
        const json = line.slice(6)
        const call = parseToolCall(json)
        if (!call) throw new Error("invalid_tool_call")
        const t0 = Date.now()
        logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "tool_run", tool: call.tool, status: "started" })
        const out = await executeTool(tools, call)
        console.log(JSON.stringify(out, null, 2))
        logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "tool_run", tool: call.tool, status: "ok", duration_ms: Date.now() - t0 })
      } catch (e: any) {
        console.error(e?.message ?? String(e))
        logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "tool_run", status: "error", error: e?.message ?? String(e) })
      }
      if (!(rl as any).closed) ask()
      return
    }
    // 将用户消息加入历史
    messages.push({ role: "user", content: line })
    logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "user_input", content_excerpt: line.slice(0, 200) })
    try {
      const sys = toolSystemPrompt(tools)
      const t0 = Date.now()
      const answer1 = await callDeepseek([{ role: "system", content: sys }, ...messages])
      logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "api_call", route: "deepseek", status: "ok", duration_ms: Date.now() - t0 })
      const call = parseToolCall(answer1)
      if (call) {
        const t1 = Date.now()
        const obs = await executeTool(tools, call)
        logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "tool_run", tool: call.tool, status: "ok", duration_ms: Date.now() - t1 })
        messages.push({ role: "assistant", content: JSON.stringify({ observation: obs }) })
        const t2 = Date.now()
        const answer2 = await callDeepseek(messages)
        logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "assistant_reply", status: "ok", duration_ms: Date.now() - t2 })
        console.log(answer2)
        messages.push({ role: "assistant", content: answer2 })
      } else {
        console.log(answer1)
        logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "assistant_reply", status: "ok" })
        messages.push({ role: "assistant", content: answer1 })
      }
    } catch (e: any) {
      console.error(e?.message ?? String(e))
      logAppend(sessionId, { ts: new Date().toISOString(), app: "cli", session_id: sessionId, type: "api_call", route: "deepseek", status: "error", error: e?.message ?? String(e) })
    }
    // 递归调用，继续等待用户输入
    if (!(rl as any).closed) ask()
  })
  }
  ask()
}

// 启动主函数，捕获并打印任何未处理的错误
main().catch(err => {
  console.error(err?.message ?? String(err))
  process.exit(1)
})