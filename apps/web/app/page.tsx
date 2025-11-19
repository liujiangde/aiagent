"use client"
import React, { useState } from "react"
import { Button as AntButton, Input, List, Spin } from "antd"

export default function Page() {
  const [text, setText] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [loading, setLoading] = useState(false)
  const [envStatus, setEnvStatus] = useState<string>("")

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
            const next = [...messages, { role: "user", content: text }]
            setMessages(next)
            setText("")
            setLoading(true)
            try {
              const res = await fetch("/api/deepseek", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
        <AntButton onClick={async () => {
          try {
            // 向 /api/env-check 发送 GET 请求，检查服务器端是否已配置 API 密钥
            // 发起 GET 请求到 /api/env-check 接口，获取环境变量检查信息
            // 临时硬编码，后续需在 apps/web/app/api 下新增 env-check/route.ts 提供该接口
            const res = await fetch("/api/env-check")
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
        <div>密钥状态：</div>
        <pre>{envStatus}</pre>
      </div>
    </main>
  )
}