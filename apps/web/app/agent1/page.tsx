"use client"
import React, { useState } from "react"
import { Typography, Input, Button, Card, Spin, message } from "antd"

export default function Agent1Page() {
  const [query, setQuery] = useState("")
  const [result, setResult] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResult("")
    try {
      const res = await fetch("/api/deepseek", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: query }]
        })
      })
      const data = await res.json()
      if (data.content) {
        setResult(data.content)
      } else if (data.error) {
        message.error("请求失败: " + (data.detail || data.error))
      }
    } catch (err) {
      message.error("请求出错")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <Typography.Title level={2}>智能体1</Typography.Title>
      <Typography.Paragraph>
        这是一个新的智能体页面。
      </Typography.Paragraph>
      
      <div style={{ maxWidth: 800, marginTop: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <Input 
            placeholder="请输入搜索内容" 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            onPressEnter={handleSearch}
            disabled={loading}
          />
          <Button type="primary" onClick={handleSearch} loading={loading}>
            搜索
          </Button>
        </div>

        {loading && <div style={{ marginBottom: 20 }}><Spin tip="思考中..." /></div>}
        
        {result && (
          <Card title="DeepSeek 回答">
            <div style={{ whiteSpace: "pre-wrap" }}>{result}</div>
          </Card>
        )}
      </div>
    </main>
  )
}
