"use client"
/**
 * 知识库管理页：
 * - 文本入库（分块 + 向量化 + 持久化）
 * - 语义检索 Top‑k 片段
 * - 索引统计展示
 */
import React, { useEffect, useState } from "react"
import { Input, Button as AntButton, Space, List, Typography, message } from "antd"

export default function KBPage() {
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [query, setQuery] = useState("")
  const [stats, setStats] = useState<{ dims?: number; chunks?: number; docs?: number }>({})
  const [results, setResults] = useState<Array<{ title?: string; text: string; score: number }>>([])
  const [sessionId, setSessionId] = useState<string>("")

  useEffect(() => {
    const k = "__session_id__"
    let sid = localStorage.getItem(k) || ""
    if (!sid) {
      sid = (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2)
      localStorage.setItem(k, sid)
    }
    setSessionId(sid)
  }, [])

  // 拉取当前索引统计
  async function refreshStats() {
    try {
      const res = await fetch("/api/kb/add_text", { headers: { "x-session-id": sessionId } })
      const data = await res.json()
      setStats({ dims: data?.dims, chunks: data?.chunks, docs: data?.docs })
    } catch {}
  }

  useEffect(() => { refreshStats() }, [])

  return (
    <main style={{ padding: 24 }}>
      <Typography.Title level={3}>知识库管理</Typography.Title>
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <Typography.Text>添加文本到知识库</Typography.Text>
          <Input placeholder="标题（可选）" value={title} onChange={e => setTitle(e.target.value)} style={{ marginTop: 8 }} />
          <Input.TextArea placeholder="粘贴长文本..." value={text} onChange={e => setText(e.target.value)} rows={8} style={{ marginTop: 8 }} />
          <Space style={{ marginTop: 8 }}>
            <AntButton type="primary" onClick={async () => {
              try {
                // 提交入库请求
                const res = await fetch("/api/kb/add_text", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ title, text }) })
                const data = await res.json()
                if (data?.error) throw new Error(String(data.error))
                message.success(`已添加，片段数 ${data.added}`)
                setTitle("")
                setText("")
                refreshStats()
              } catch (e: any) {
                message.error(e?.message ?? "添加失败")
              }
            }}>添加</AntButton>
          </Space>
        </div>
        <div>
          <Typography.Text>语义检索</Typography.Text>
          <Space style={{ marginTop: 8 }}>
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入查询" style={{ width: 400 }} />
            <AntButton onClick={async () => {
              if (!query.trim()) return
              try {
                // 发起检索请求
                const res = await fetch("/api/kb/search", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ query, k: 5 }) })
                const data = await res.json()
                setResults(Array.isArray(data?.items) ? data.items : [])
              } catch {
                setResults([])
              }
            }}>搜索</AntButton>
          </Space>
        </div>
        <div>
          <Typography.Text>索引统计</Typography.Text>
          <div>维度：{String(stats.dims ?? "")} 片段：{String(stats.chunks ?? "")} 文档：{String(stats.docs ?? "")}</div>
        </div>
        <div>
          <Typography.Text>检索结果</Typography.Text>
          <List
            size="small"
            bordered
            dataSource={results}
            renderItem={it => (
              <List.Item>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <strong>{it.title || "(无标题)"}</strong>
                  <span style={{ color: "#666" }}>score: {it.score}</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{it.text}</span>
                </div>
              </List.Item>
            )}
          />
        </div>
      </Space>
    </main>
  )
}