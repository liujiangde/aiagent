# @aiagent/retrieval

作用
- 提供最小可用的本地向量检索能力：文本分块、固定维度哈希词袋嵌入、余弦相似、Top‑k 检索与索引持久化（JSON）。

能力
- 分词与清洗：英文/数字/中文范围
- 向量生成：1024 维哈希词袋 + L2 归一化
- 相似度：余弦相似排序
- 持久化：索引文件位于 `packages/retrieval/data/index.json`

导出 API（`src/index.ts`）
- `addDocument({ title?, text, chunkSize? })`：添加文档，自动分块并写入索引，返回 `{ docId, added }`
- `search({ query, k? })`：语义检索，返回 `{ query, items: [{ title?, text, score }] }`
- `stats()`：索引统计 `{ dims, chunks, docs }`

使用示例
```ts
import * as kb from "@aiagent/retrieval"

// 添加文本
const { docId, added } = kb.addDocument({ title: "示例", text: longText })

// 检索
const res = kb.search({ query: "什么是工具调用", k: 5 })
console.log(res.items)

// 统计
console.log(kb.stats())
```

注意
- 该实现用于开发与演示阶段，后续可替换为 Chroma/FAISS 等，同时保持 `addDocument/search/stats` API 不变作为降级路径。