/**
 * 轻量向量检索库（最小可用实现）
 *
 * 设计目标：零外部依赖、即可持久化的 Top‑k 语义检索，便于在开发阶段快速接入 RAG。
 * 方法：
 * - 文本清洗 + 词切分（英文/数字/中文简体范围）
 * - 哈希词袋向量（固定维度 1024），L2 归一化
 * - 余弦相似度 + BM25 融合重排序
 * - 按文档去重，并进行多片段拼接形成更完整的上下文
 * - 索引以 JSON 文件持久化，避免数据库依赖
 */
import fs from "node:fs"
import path from "node:path"

/**
 * 索引片段：对应一次分块后的文本单元
 */
export type KBChunk = {
  id: string
  docId: string
  title?: string
  text: string
  vec: number[]
}

/**
 * 索引结构：包含版本、维度与所有片段
 */
export type KBIndex = {
  version: number
  dims: number
  chunks: KBChunk[]
}

const DIMS = 1024
const DATA_DIR = path.resolve(__dirname, "../data")
const INDEX_FILE = path.resolve(DATA_DIR, "index.json")

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * 文本清洗与分词（英文/数字/中文）
 */
function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
  return cleaned.split(/\s+/).filter(Boolean)
}

/**
 * 简单哈希：将 token 映射到固定维度索引
 */
function hashToken(tok: string): number {
  let h = 2166136261
  for (let i = 0; i < tok.length; i++) {
    h ^= tok.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return Math.abs(h) % DIMS
}

/**
 * 生成嵌入：词袋向量并做 L2 归一化
 */
function embed(text: string): number[] {
  const toks = tokenize(text)
  const vec = new Array<number>(DIMS).fill(0)
  for (const t of toks) vec[hashToken(t)] += 1
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm
  return vec
}

/**
 * 余弦相似度
 */
function cosine(a: number[], b: number[]): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/**
 * 加载索引；若不存在则创建空索引
 */
export function loadIndex(): KBIndex {
  ensureDataDir()
  if (!fs.existsSync(INDEX_FILE)) {
    const idx: KBIndex = { version: 1, dims: DIMS, chunks: [] }
    fs.writeFileSync(INDEX_FILE, JSON.stringify(idx))
    return idx
  }
  const txt = fs.readFileSync(INDEX_FILE, "utf8")
  try {
    const j = JSON.parse(txt)
    return j as KBIndex
  } catch {
    const idx: KBIndex = { version: 1, dims: DIMS, chunks: [] }
    fs.writeFileSync(INDEX_FILE, JSON.stringify(idx))
    return idx
  }
}

/**
 * 保存索引
 */
export function saveIndex(idx: KBIndex) {
  ensureDataDir()
  fs.writeFileSync(INDEX_FILE, JSON.stringify(idx))
}

/**
 * 简单随机 ID
 */
function makeId(): string {
  return Math.random().toString(36).slice(2)
}

/**
 * 添加文档并自动分块、生成嵌入、持久化
 * @param doc.title 标题（可选）
 * @param doc.text 文本内容
 * @param doc.chunkSize 分块大小（默认 800，范围 300-1500）
 */
export function addDocument(doc: { id?: string; title?: string; text: string; chunkSize?: number }) {
  const idx = loadIndex()
  const docId = doc.id || makeId()
  const size = Math.max(300, Math.min(1500, Number(doc.chunkSize ?? 800)))
  const chunks: string[] = []
  let buf = ""
  const parts = doc.text.split(/([\n\r]|。|！|？|；|;|\.|\?|!)/)
  for (const p of parts) {
    buf += p
    if (buf.length >= size) { chunks.push(buf); buf = "" }
  }
  if (buf.trim()) chunks.push(buf)
  for (const t of chunks) {
    const vec = embed(t)
    const id = makeId()
    idx.chunks.push({ id, docId, title: doc.title, text: t, vec })
  }
  saveIndex(idx)
  return { docId, added: chunks.length }
}

/**
 * 语义检索 Top‑k 片段
 * @param args.query 查询文本
 * @param args.k 返回条数（默认 5，范围 1-20）
 */
export function search(args: { query: string; k?: number }) {
  const idx = loadIndex()
  const k = Math.max(1, Math.min(20, Number(args.k ?? 5)))
  const qv = embed(args.query)
  const base = idx.chunks.map(ch => ({ chunk: ch, cos: cosine(qv, ch.vec) }))
  base.sort((a, b) => b.cos - a.cos)
  const poolSize = Math.min(base.length, Math.max(10, k * 5))
  const pool = base.slice(0, poolSize)

  const qTokens = tokenize(args.query)
  const allChunks = idx.chunks
  const avgdl = (() => {
    if (allChunks.length === 0) return 1
    let sum = 0
    for (const c of allChunks) sum += tokenize(c.text).length
    return sum / allChunks.length
  })()
  const df = new Map<string, number>()
  for (const c of allChunks) {
    const set = new Set(tokenize(c.text))
    for (const t of set) df.set(t, (df.get(t) || 0) + 1)
  }
  const N = allChunks.length || 1
  const k1 = 1.2
  const b = 0.75
  function bm25(chunkText: string): number {
    const toks = tokenize(chunkText)
    const dl = toks.length || 1
    let s = 0
    const tf = new Map<string, number>()
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1)
    for (const qt of qTokens) {
      const dfv = df.get(qt) || 0.5
      const idf = Math.log((N - dfv + 0.5) / (dfv + 0.5) + 1)
      const tfv = tf.get(qt) || 0
      const num = tfv * (k1 + 1)
      const den = tfv + k1 * (1 - b + b * (dl / avgdl))
      s += idf * (den === 0 ? 0 : num / den)
    }
    return s
  }
  let bmMax = 0
  const rescored = pool.map(p => {
    const bm = bm25(p.chunk.text)
    if (bm > bmMax) bmMax = bm
    return { chunk: p.chunk, cos: p.cos, bm }
  })
  const mix = rescored.map(r => {
    const bmNorm = bmMax > 0 ? r.bm / bmMax : 0
    const score = 0.5 * r.cos + 0.5 * bmNorm
    return { chunk: r.chunk, score }
  })
  mix.sort((a, b) => b.score - a.score)
  // 基于融合分数对候选进行按文档分组，并做多片段拼接
  const perDocMax = 3 // 每个文档最多取 3 个片段参与拼接
  const maxDocLen = 2000 // 单个文档拼接后的最大字符数
  const grouped = new Map<string, { title?: string; parts: Array<{ text: string; score: number }> }>()
  for (const m of mix) {
    const did = m.chunk.docId
    let g = grouped.get(did)
    if (!g) { g = { title: m.chunk.title, parts: [] }; grouped.set(did, g) }
    if (g.parts.length < perDocMax) {
      g.parts.push({ text: m.chunk.text, score: m.score })
    }
  }
  // 计算文档层打分（取该文档内片段的最大融合分数），并生成拼接文本
  const docsRank: Array<{ docId: string; title?: string; text: string; score: number }> = []
  for (const [docId, g] of grouped.entries()) {
    const sortedParts = g.parts.sort((a, b) => b.score - a.score)
    const sentencesSeen = new Set<string>()
    let buf = ""
    for (const p of sortedParts) {
      // 简单压缩：去多余空白与重复句子
      const comp = String(p.text).replace(/\s+/g, " ").trim()
      const segs = comp.split(/(?<=[。；;.!?\n])/)
      for (const s of segs) {
        const ss = s.trim()
        if (!ss) continue
        if (sentencesSeen.has(ss)) continue
        if ((buf + ss).length > maxDocLen) { break }
        sentencesSeen.add(ss)
        buf += (buf ? "\n" : "") + ss
      }
      if (buf.length >= maxDocLen) break
    }
    const docScore = sortedParts.length > 0 ? sortedParts[0].score : 0
    docsRank.push({ docId, title: g.title, text: buf, score: Number(docScore.toFixed(6)) })
  }
  // 选择 Top‑k 文档
  docsRank.sort((a, b) => b.score - a.score)
  const out = docsRank.slice(0, k)
  return { query: args.query, items: out }
}

/**
 * 索引统计信息
 */
export function stats() {
  const idx = loadIndex()
  const docs = new Set(idx.chunks.map(c => c.docId))
  return { dims: idx.dims, chunks: idx.chunks.length, docs: docs.size }
}