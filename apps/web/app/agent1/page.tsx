"use client"
import React, { useState } from "react"
import { Typography, Input, Button, Card, Spin, message } from "antd"

/**
 * 智能体1页面
 * 演示如何调用 DeepSeek 流式接口并实时展示回答
 */
export default function Agent1Page() {
  // 用户输入的问题
  const [query, setQuery] = useState("")
  // 大模型返回的累积文本结果
  const [result, setResult] = useState("")
  // 加载状态，用于控制按钮禁用与 Loading 动画
  const [loading, setLoading] = useState(false)

  /**
   * 处理搜索点击事件
   * 发起流式请求并逐块解析 SSE 数据
   */
  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResult("") // 清空上次结果
    
    try {
      // 调用后端代理接口，开启流式传输 (stream: true)
      const res = await fetch("/api/deepseek", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: query }],
          stream: true,
        })
      })
      // 处理非 200 错误
      if (!res.ok) {
        const data = await res.json()
        message.error("请求失败: " + (data.detail || data.error))
        setLoading(false)
        return
      }

      if (!res.body) throw new Error("no_stream")
      
      // 初始化流读取器
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = "" // 用于累积当前会话的完整文本
      // 循环读取流数据
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // 解码二进制块为文本
        const chunk = decoder.decode(value, { stream: true })
        // 解析 SSE 格式数据
        // DeepSeek/OpenAI 格式通常是 "data: {...}\n\n"
        // 可能一次收到多行，需按换行符分割
        const lines = chunk.split("\n")
        for (const line of lines) {
          // 仅处理以 "data:" 开头的有效行
          if (line.trim().startsWith("data:")) {
            const dataStr = line.slice(5).trim()
            // "[DONE]" 标记流结束
            if (dataStr === "[DONE]") continue
            try {
              const data = JSON.parse(dataStr)
              // 提取增量内容 (delta content)
              const content = data.choices?.[0]?.delta?.content || ""
              if (content) {
                acc += content
                // console.log("acc:999", acc)
                setResult(acc) // 实时更新 UI
              }
            } catch (e) {
              console.error("解析流式数据失败", e)
            }
          }
        }
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
        {/* 搜索输入区域 */}
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

        {/* 等待首次响应时的 Loading 提示 */}
        {loading && !result && <div style={{ marginBottom: 20 }}><Spin tip="思考中..." /></div>}
        
        {/* 结果展示卡片 */}
        {result && (
          <Card title="DeepSeek 回答">
            <div style={{ whiteSpace: "pre-wrap" }}>{result}</div>
          </Card>
        )}
      </div>
    </main>
  )
}
