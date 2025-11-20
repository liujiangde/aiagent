启动前端（单应用）：在根目录执行 npm run dev -w apps/web
启动整个工作区（并行管线）：在根目录执行 npm run dev
启动 CLI 助手：先构建 npm run build -w apps/cli ，然后运行 npm run start -w apps/cli