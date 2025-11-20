"use client"
import React, { useEffect, useState } from "react"
import { Button as AntButton, Input, List, Spin } from "antd"

export default function Page() {
  const [text, setText] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [loading, setLoading] = useState(false)
  const [envStatus, setEnvStatus] = useState<string>("")
  const [searchItems, setSearchItems] = useState<Array<{ title: string; url: string; snippet: string }>>([])
  const [fetchResult, setFetchResult] = useState<{ status?: number; contentType?: string; text?: string } | null>(null)
  const [ragLoading, setRagLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState("")
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

  async function autoSearchAndFetch(input: string) {
    const q = input.trim()
    if (!q) return
    let asUrl: string | null = null
    try {
      const u = new URL(q)
      if (u.protocol === "http:" || u.protocol === "https:") asUrl = q
    } catch {}
    if (asUrl) {
      try {
        const rf = await fetch("/api/tools/web_fetch", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ url: asUrl }) })
        const dj = await rf.json()
        setFetchResult({ status: dj?.status, contentType: dj?.contentType, text: dj?.text })
        setSearchItems([])
      } catch {
        setFetchResult({ text: "抓取失败" })
      }
      return
    }
    try {
      const rs = await fetch("/api/tools/search", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ query: q, limit: 5 }) })
      const dj = await rs.json()
      const items = Array.isArray(dj?.items) ? dj.items : []
      setSearchItems(items)
      const first = items[0]
      if (first?.url) {
        try {
          const rf = await fetch("/api/tools/web_fetch", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ url: first.url }) })
          const fj = await rf.json()
          setFetchResult({ status: fj?.status, contentType: fj?.contentType, text: fj?.text })
        } catch {
          setFetchResult({ text: "抓取失败" })
        }
      }
    } catch {
      setSearchItems([])
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>AI Agent Web</h1>
      <p>前端 monorepo 脚手架示例。</p>
      <div style={{ display: "flex", gap: 8 }}>
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="输入内容"
          style={{ flex: 1 }}
        />
        <AntButton
          type="primary"
          loading={loading}
          onClick={async () => {
            if (!text.trim()) return
            autoSearchAndFetch(text).catch(() => {})
            const next = [...messages, { role: "user", content: text }]
            setMessages(next)
            setText("")
            setLoading(true)
            try {
              const res = await fetch("/api/deepseek", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-session-id": sessionId },
                body: JSON.stringify({ messages: next, temperature: 0 })
              })
              const data = await res.json()
              const reply = String(data?.content ?? "")
              setMessages(m => [...m, { role: "assistant", content: reply }])
            } catch {
              setMessages(m => [...m, { role: "assistant", content: "调用失败" }])
            } finally {
              setLoading(false)
            }
          }}
        >发送</AntButton>

        <AntButton loading={ragLoading} onClick={async () => {
          if (!text.trim()) return
          setRagLoading(true)
          autoSearchAndFetch(text).catch(() => {})
          try {
            const res = await fetch("/api/rag/kb_answer", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ query: text, k: 5, temperature: 0 }) })
            const data = await res.json()
            setSearchItems(Array.isArray(data?.items) ? data.items : [])
            const reply = String(data?.answer ?? "")
            setMessages(m => [...m, { role: "assistant", content: reply }])
          } catch {
            setMessages(m => [...m, { role: "assistant", content: "知识库回答失败" }])
          } finally {
            setRagLoading(false)
          }
        }}>知识库回答</AntButton>
        <AntButton loading={streaming} onClick={async () => {
          if (!text.trim()) return
          setStreaming(true)
          setStreamText("")
          autoSearchAndFetch(text).catch(() => {})
          try {
            const res = await fetch("/api/rag/stream", { method: "POST", headers: { "Content-Type": "application/json", "x-session-id": sessionId }, body: JSON.stringify({ query: text, limit: 5, temperature: 0 }) })
            if (!res.body) throw new Error("no_stream")
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buf = ""
            let acc = ""
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buf += decoder.decode(value, { stream: true })
              const parts = buf.split("\n\n")
              buf = parts.pop() || ""
              for (const part of parts) {
                const lines = part.split("\n").filter(Boolean)
                let ev = "message"
                let ds = ""
                for (const line of lines) {
                  if (line.startsWith("event:")) ev = line.slice(6).trim()
                  if (line.startsWith("data:")) ds = line.slice(5).trim()
                }
                if (ev === "citations") {
                  try {
                    const j = JSON.parse(ds)
                    setSearchItems(Array.isArray(j?.items) ? j.items : [])
                  } catch {}
                } else if (ev === "token") {
                  acc += ds
                  setStreamText(acc)
                } else if (ev === "done") {
                  setStreaming(false)
                }
              }
            }
            setStreaming(false)
            if (acc) setMessages(m => [...m, { role: "assistant", content: acc }])
          } catch {
            setStreaming(false)
          }
        }}>检索回答(流式)</AntButton>
        <AntButton onClick={async () => {
          try {
            // 向 /api/env-check 发送 GET 请求，检查服务器端是否已配置 API 密钥
            // 发起 GET 请求到 /api/env-check 接口，获取环境变量检查信息
            // 临时硬编码，后续需在 apps/web/app/api 下新增 env-check/route.ts 提供该接口
            const res = await fetch("/api/env-check", { headers: { "x-session-id": sessionId } })
            const data = await res.json()
            setEnvStatus(`密钥存在: ${data.hasKey ? "是" : "否"}，长度: ${data.length}`)
          } catch {
            setEnvStatus("检查失败")
          }
        }}>检查API密钥</AntButton>
      </div>
      <div style={{ marginTop: 16 }}>
        <div>会话：</div>
        {loading && <Spin />}
        <List
          size="small"
          bordered
          dataSource={messages}
          renderItem={m => (
            <List.Item>
              <strong>{m.role}：</strong>
              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
            </List.Item>
          )}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <div>引用列表：</div>
        <List
          size="small"
          bordered
          dataSource={searchItems}
          renderItem={it => (
            <List.Item>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <a href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
                <span style={{ color: "#666" }}>{it.snippet}</span>
              </div>
            </List.Item>
          )}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <div>流式回答：</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{streamText}</pre>
      </div>
      <div style={{ marginTop: 16 }}>
        <div>抓取网页：</div>
        {fetchResult && (
          <div>
            <div>状态：{String(fetchResult.status ?? "")} 类型：{String(fetchResult.contentType ?? "")}</div>
            <pre style={{ whiteSpace: "pre-wrap" }}>{fetchResult.text}</pre>
          </div>
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        <div>密钥状态：</div>
        <pre>{envStatus}</pre>
      </div>
    </main>
  )
}