import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import dotenv from 'dotenv'
import { getPort } from './env'

dotenv.config()

const fastify = Fastify({
  logger: true
})

await fastify.register(cors, {
  origin: '*'
})

fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
  return { hello: 'bff world' }
})

fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

const start = async () => {
  try {
    const port = getPort()
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`BFF Server running on http://localhost:${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
