// - 它是工作区内的包名，来自 packages/ui/package.json:2 的 "name": "@aiagent/ui"
// - 在应用中实际解析到源码入口： apps/web/tsconfig.json:5-9 将 @aiagent/ui 映射到 packages/ui/src/index.ts
// - 入口再导出组件： packages/ui/src/index.ts:1 导出 Button ，源文件为 packages/ui/src/lib/Button.tsx:5-18
const nextConfig = {
  transpilePackages: ["@aiagent/ui"]
}

module.exports = nextConfig