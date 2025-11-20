/**
 * 轻量向量检索库（最小可用实现）
 *
 * 设计目标：零外部依赖、即可持久化的 Top‑k 语义检索，便于在开发阶段快速接入 RAG。
 * 方法：
 * - 文本清洗 + 词切分（英文/数字/中文简体范围）
 * - 哈希词袋向量（固定维度 1024），L2 归一化
 * - 余弦相似度排序，返回 Top‑k 片段
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
  const qv = embed(args.query)
  const k = Math.max(1, Math.min(20, Number(args.k ?? 5)))
  const scored = idx.chunks.map(ch => ({ chunk: ch, score: cosine(qv, ch.vec) }))
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, k).map(s => ({
    docId: s.chunk.docId,
    title: s.chunk.title,
    text: s.chunk.text,
    score: Number(s.score.toFixed(6))
  }))
  return { query: args.query, items: top }
}

/**
 * 索引统计信息
 */
export function stats() {
  const idx = loadIndex()
  const docs = new Set(idx.chunks.map(c => c.docId))
  return { dims: idx.dims, chunks: idx.chunks.length, docs: docs.size }
}