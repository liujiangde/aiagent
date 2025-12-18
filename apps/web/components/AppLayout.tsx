"use client"
import React from "react"
import { Layout, Menu, Switch, Space, Typography } from "antd"
import { useTheme } from "../app/providers"

const { Header, Content, Footer } = Layout

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { dark, toggle } = useTheme()

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Typography.Title level={4} style={{ margin: 0, color: "#fff" }}>AI Agent Web</Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          items={[
            { key: "home", label: "首页" },
            { key: "docs", label: "文档" }
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