import type { ReactNode } from "react"
import Providers from "./providers"
import "antd/dist/reset.css"
import AppLayout from "../components/AppLayout"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  )
}