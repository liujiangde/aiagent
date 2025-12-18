"use client"
import React, { useEffect, useState } from "react"
import { Button as AntButton, Input, List, Spin } from "antd"

export default function Page() {
  const [text, setText] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [loading, setLoading] = useState(false)
  const [envStatus, setEnvStatus] = useState<string>("")
  const [metricsSummary, setMetricsSummary] = useState<any | null>(null)
  const [searchItems, setSearchItems] = useState<Array<{ title: string; url: string; snippet: string }>>([])
  const [fetchResult, setFetchResult] = useState<{ status?: number; contentType?: string; text?: string } | null>(null)
  const [streamText, setStreamText] = useState("")
  const [sessionId, setSessionId] = useState<string>("")
  const [plannerTrace, setPlannerTrace] = useState<Array<{ step: string; detail?: any; duration_ms?: number }>>([])
  const [plannerMetrics, setPlannerMetrics] = useState<Record<string, any> | null>(null)

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
            setMessages(next as { role: "user" | "assistant"; content: string }[])
            setText("")
            setLoading(true)
            setPlannerTrace([])
            setPlannerMetrics(null)
            setEnvStatus("")
            setMetricsSummary(null)
            try {
              const headers = { "Content-Type": "application/json", "x-session-id": sessionId }
              const [deep, plan, kb, env, met] = await Promise.allSettled([
                fetch("/api/deepseek", { method: "POST", headers, body: JSON.stringify({ messages: next, temperature: 0 }) }).then(r => r.json()),
                fetch("/api/agent/plan_execute", { method: "POST", headers, body: JSON.stringify({ prompt: text }) }).then(r => r.json()),
                fetch("/api/rag/kb_answer", { method: "POST", headers, body: JSON.stringify({ query: text, k: 5, temperature: 0 }) }).then(r => r.json()),
                fetch("/api/env-check", { headers: { "x-session-id": sessionId } }).then(r => r.json()),
                fetch("/api/metrics/summary", { headers: { "x-session-id": sessionId } }).then(r => r.json())
              ])
              if (deep.status === "fulfilled") {
                const reply = String(deep.value?.content ?? "")
                if (reply) setMessages(m => [...m, { role: "assistant", content: reply }])
              } else {
                setMessages(m => [...m, { role: "assistant", content: "调用失败" }])
              }
              if (plan.status === "fulfilled") {
                const dj = plan.value
                setPlannerTrace(Array.isArray(dj?.trace) ? dj.trace : [])
                setPlannerMetrics(dj?.metrics ?? null)
                const reply = String(dj?.final_answer ?? "")
                if (reply) setMessages(m => [...m, { role: "assistant", content: reply }])
              }
              if (kb.status === "fulfilled") {
                const data = kb.value
                setSearchItems(Array.isArray(data?.items) ? data.items : [])
                const reply = String(data?.answer ?? "")
                if (reply) setMessages(m => [...m, { role: "assistant", content: reply }])
              }
              if (env.status === "fulfilled") {
                const data = env.value
                setEnvStatus(`密钥存在: ${data.hasKey ? "是" : "否"}，长度: ${data.length}`)
              }
              if (met.status === "fulfilled") setMetricsSummary(met.value)
              try {
                const res = await fetch("/api/rag/stream", { method: "POST", headers, body: JSON.stringify({ query: text, limit: 5, temperature: 0 }) })
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
                    }
                  }
                }
                if (acc) setMessages(m => [...m, { role: "assistant", content: acc }])
              } catch {
              }
            } finally {
              setLoading(false)
            }
          }}
        >发送</AntButton>

        

        
        
        
        
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
      {/* 规划执行轨迹与指标展示 */}
      <div style={{ marginTop: 16 }}>
        <div>规划执行轨迹：</div>
        <List
          size="small"
          bordered
          dataSource={plannerTrace}
          renderItem={st => (
            <List.Item>
              <strong>{st.step}</strong>
              <span style={{ marginLeft: 8, color: "#666" }}>耗时：{String(st.duration_ms ?? 0)}ms</span>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(st.detail ?? {}, null, 2)}</pre>
            </List.Item>
          )}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <div>规划执行指标：</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{plannerMetrics ? JSON.stringify(plannerMetrics, null, 2) : "无"}</pre>
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
      <div style={{ marginTop: 16 }}>
        <div>指标汇总：</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{metricsSummary ? JSON.stringify(metricsSummary, null, 2) : "无"}</pre>
      </div>
    </main>
  )
}
