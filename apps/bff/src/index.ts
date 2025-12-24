// 引入 Fastify 框架及其类型定义
import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
// 引入跨域处理插件
import cors from '@fastify/cors'
// 引入环境变量配置
import dotenv from 'dotenv'
// 引入自定义端口获取函数
import { getPort } from './env'

// 加载 .env 文件中的环境变量
dotenv.config()

// 创建 Fastify 实例，开启日志记录
const fastify = Fastify({
  logger: true
})

// 注册跨域插件，允许所有来源访问
await fastify.register(cors, {
  origin: '*'
})

// 根路由：返回 BFF 服务欢迎信息
fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
  return { hello: 'bff world' }
})

// 健康检查路由：返回服务状态和时间戳
fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// 启动服务的异步函数
const start = async () => {
  try {
    // 获取监听端口
    const port = getPort()
    // 启动服务器，监听所有网络接口
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`BFF Server running on http://localhost:${port}`)
  } catch (err) {
    // 启动失败时记录错误并退出进程
    fastify.log.error(err)
    process.exit(1)
  }
}

// 执行启动函数
start()
