/**
 * Deepseek SSE 路由
 * - 端点：GET /deepseek/sse?q=...
 * - 功能：代理调用 Deepseek Chat Completions（开启 stream:true），逐片段解析并通过 Server-Sent Events 推送到客户端
 * - 密钥：通过 getDeepseekKey() 从 apps/bff/.env.local（优先）或 .env 读取 DEEPSEEK_API_KEY
 * - 断线：监听客户端关闭事件，及时结束上游读取并收尾响应
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDeepseekKey } from './env'

type ChatMessage = { role: 'user' | 'system' | 'assistant'; content: string }

/**
 * 设置 SSE 必需响应头
 */
function headers(reply: FastifyReply) {
  reply.header('Content-Type', 'text/event-stream')
  reply.header('Cache-Control', 'no-cache')
  reply.header('Connection', 'keep-alive')
}

/**
 * 向上游 Deepseek 以流式方式发起请求
 */
async function upstream(messages: ChatMessage[], apiKey: string, model = 'deepseek-chat') {
  const body = JSON.stringify({ model, messages, stream: true })
  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body
  })
  if (!resp.ok) throw new Error(await resp.text().catch(() => 'upstream_error'))
  return resp
}

/**
 * 解析上游 SSE 的单行 data: 内容，兼容 delta/message/content 三种位置
 */
function extractContent(line: string): string {
  try {
    const m = line.match(/^data:\s*(.+)$/)
    if (!m) return ''
    const obj = JSON.parse(m[1])
    const a = obj?.choices?.[0]?.delta?.content
    const b = obj?.choices?.[0]?.message?.content
    const c = obj?.content
    const s = a ?? b ?? c ?? ''
    return typeof s === 'string' ? s : ''
  } catch {
    return ''
  }
}

/**
 * 注册 Deepseek SSE 路由：将上游片段转为标准 SSE 的 data: 行
 */
export async function registerDeepseekSSE(fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/deepseek/sse',
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const apiKey = getDeepseekKey()
      if (!apiKey) {
        headers(reply)
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'DEEPSEEK_API_KEY missing' })}\n\n`)
        reply.raw.end()
        return
      }
      headers(reply)
      const q = String((request.query as any)?.q ?? '').trim()
      const messages: ChatMessage[] = q ? [{ role: 'user', content: q }] : [{ role: 'user', content: '' }]
      try {
        const resp = await upstream(messages, apiKey)
        const reader = resp.body?.getReader()
        if (!reader) {
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'no_stream' })}\n\n`)
          reply.raw.end()
          return
        }
        const encoder = new TextDecoder('utf-8')
        let closed = false
        request.raw.on('close', () => { closed = true })
        while (!closed) {
          const { value, done } = await reader.read()
          if (done) break
          const text = encoder.decode(value)
          const lines = text.split(/\r?\n/)
          for (const line of lines) {
            const chunk = extractContent(line)
            if (chunk) reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        }
        reply.raw.end()
      } catch (e: any) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: e?.message ?? String(e) })}\n\n`)
        reply.raw.end()
      }
    }
  })
}
