# BFF 服务（Fastify）

作用
- 提供后端适配层：跨域支持、健康检查、入口统一与环境解析。

开发运行
- 启动：`pnpm --filter bff-service dev`（监听 `src/index.ts`）
- 访问：`http://localhost:4000/`（默认端口，可通过 `PORT` 变更）

端口与环境
- 端口解析：`apps/bff/src/env.ts:1-6`（无效值回退 `4000`）
- 入口使用：`apps/bff/src/index.ts:23-27`
- 示例环境：`apps/bff/.env.example:1`（`PORT=4000`）

健康检查
- `GET /health` 返回 `{ status: "ok", timestamp }`（`apps/bff/src/index.ts:19-21`）
