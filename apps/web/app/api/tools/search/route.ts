import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const query = String(body?.query ?? "").trim()
  const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 5)))
  if (!query) return NextResponse.json({ error: "missing_query" }, { status: 400 })

  async function tryHtml(source: "bing" | "so" | "baidu") {
    let url = ""
    let pattern: RegExp
    const UA = { headers: { "User-Agent": "aiagent/0.1", "Accept": "text/html" } }
    if (source === "bing") {
      url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`
      pattern = /<li class=\"b_algo\">[\s\S]*?<h2>\s*<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
    } else if (source === "so") {
      url = `https://www.so.com/s?q=${encodeURIComponent(query)}&num=${limit}`
      pattern = /<h3[^>]*res-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*res-desc[^>]*>([\s\S]*?)<\/p>/gi
    } else {
      url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${limit}`
      pattern = /<h3[^>]*c-title[^>]*>[\s\S]*?<a[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]*c-abstract[^>]*>([\s\S]*?)<\/div>/gi
    }
    const resp = await fetch(url, UA)
    if (!resp.ok) return [] as Array<{ title: string; url: string; snippet: string }>
    const html = await resp.text()
    const items: Array<{ title: string; url: string; snippet: string }> = []
    let m: RegExpExecArray | null
    while ((m = pattern.exec(html)) && items.length < limit) {
      const href = m[1]
      const title = String(m[2]).replace(/<[^>]+>/g, " ").trim()
      const snippet = String(m[3]).replace(/<[^>]+>/g, " ").trim()
      items.push({ title, url: href, snippet })
    }
    return items
  }

  let items = await tryHtml("bing")
  if (items.length === 0) items = await tryHtml("so")
  if (items.length === 0) items = await tryHtml("baidu")
  return NextResponse.json({ query, items })
}