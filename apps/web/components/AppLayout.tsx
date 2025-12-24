"use client"
import React from "react"
import { Layout, Menu, Switch, Space, Typography } from "antd"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "../app/providers"
import { useEffect, useState } from "react"

const { Header, Content, Footer } = Layout

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { dark, toggle } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const [envMissing, setEnvMissing] = useState<string[]>([])
  const [envChecked, setEnvChecked] = useState(false)

  useEffect(() => {
    fetch("/api/env-check")
      .then(r => r.json())
      .then(j => {
        setEnvMissing(Array.isArray(j?.missing) ? j.missing : [])
        setEnvChecked(true)
      })
      .catch(() => {
        setEnvMissing([])
        setEnvChecked(true)
      })
  }, [])

  const activeKey = (() => {
    if (pathname?.startsWith("/agent1")) return "agent1"
    return "home"
  })()

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Typography.Title level={4} style={{ margin: 0, color: "#fff" }}>AI Agent Web</Typography.Title>
        {envChecked && envMissing.length > 0 && (
          <Typography.Text style={{ color: "#ffccc7", background: "#820014", padding: "2px 8px", borderRadius: 4 }}>
            环境未配置：{envMissing.join(", ")}
          </Typography.Text>
        )}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[activeKey]}
          onClick={({ key }) => {
            if (key === "home") router.push("/")
            else if (key === "agent1") router.push("/agent1")
          }}
          items={[
            { key: "home", label: "首页" },
            { key: "agent1", label: "智能体1" }
          ]}
          style={{ flex: 1 }}
        />
        <Space>
          <span style={{ color: "#fff" }}>暗色</span>
          <Switch checked={dark} onChange={toggle} />
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <div>{children}</div>
      </Content>
      <Footer style={{ textAlign: "center" }}>
        © {new Date().getFullYear()} AI Agent Monorepo
      </Footer>
    </Layout>
  )
}
