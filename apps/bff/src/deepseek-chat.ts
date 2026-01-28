/**
 * Deepseek 非流式对话路由
 * - 端点：POST /deepseek/chat
 * - 请求：{ model?: string, messages: Array<{role, content}>, temperature?: number }
 * - 响应：{ model, content }
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getDeepseekKey } from './env'

type ChatMessage = { role: 'user' | 'system' | 'assistant'; content: string }

export async function registerDeepseekChat(fastify: FastifyInstance) {
  fastify.route({
    method: 'GET',
    url: '/deepseek/key_check',
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const hasKey = !!getDeepseekKey()
      return reply.send({ hasKey })
    }
  })
  fastify.route({
    method: 'POST',
    url: '/deepseek/chat',
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const apiKey = getDeepseekKey()
      if (!apiKey) return reply.status(400).send({ error: 'DEEPSEEK_API_KEY missing' })
      const body = (request.body ?? {}) as any
      const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [{ role: 'user', content: 'Hello' }]
      const model = String(body?.model ?? 'deepseek-chat')
      const temperature = Number.isFinite(Number(body?.temperature)) ? Number(body.temperature) : 0
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature })
      })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        return reply.status(502).send({ error: 'upstream_error', detail: txt })
      }
      type DeepseekResponse = { choices?: Array<{ message?: { content?: string } }> }
      const data = (await resp.json()) as DeepseekResponse
      const content = data.choices?.[0]?.message?.content ?? ''
      return reply.send({ model, content })
    }
  })
}
