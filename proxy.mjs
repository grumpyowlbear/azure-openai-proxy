#!/usr/bin/env bun

// Azure OpenAI Proxy
// Bridges OpenAI SDK → Azure OpenAI by appending ?api-version= to all requests.
// This lets tools like OpenCode use Azure-hosted models (including Responses API
// models like Codex) that the SDK can't reach directly due to URL pattern mismatches.

const AZURE_BASE =
  process.env.AZURE_OPENAI_BASE_URL ||
  "https://YOUR-RESOURCE.cognitiveservices.azure.com/openai"

const API_VERSION = process.env.AZURE_API_VERSION || "2025-03-01-preview"
const PORT = parseInt(process.env.PORT || "18924", 10)

if (AZURE_BASE.includes("YOUR-RESOURCE")) {
  console.error(
    "Set AZURE_OPENAI_BASE_URL or edit proxy.mjs with your Azure resource URL.",
  )
  process.exit(1)
}

Bun.serve({
  port: PORT,
  idleTimeout: 255, // max seconds to keep connection alive between chunks (default 10)
  async fetch(req) {
    const url = new URL(req.url)
    const sep = url.search ? "&" : "?"
    const target = `${AZURE_BASE}${url.pathname}${url.search}${sep}api-version=${API_VERSION}`

    const headers = new Headers(req.headers)
    headers.delete("host")

    // Convert Authorization: Bearer → api-key header
    const auth = headers.get("authorization")
    if (auth?.startsWith("Bearer ")) {
      headers.set("api-key", auth.slice(7))
      headers.delete("authorization")
    }

    // Buffer request body to avoid stream-forwarding issues
    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? await req.arrayBuffer()
        : undefined

    try {
      const response = await fetch(target, {
        method: req.method,
        headers,
        body,
        // Prevent Bun from applying a default timeout on the upstream fetch
        signal: AbortSignal.timeout(300_000), // 5 minutes
      })

      // Copy response headers and ensure chunked streaming stays open
      const resHeaders = new Headers(response.headers)
      resHeaders.delete("content-length") // let Bun handle chunked encoding

      return new Response(response.body, {
        status: response.status,
        headers: resHeaders,
      })
    } catch (err) {
      console.error("Proxy error:", err.message)
      return Response.json(
        { error: { message: "Proxy error: " + err.message } },
        { status: 502 },
      )
    }
  },
})

console.log(`Azure OpenAI proxy listening on http://localhost:${PORT}`)
console.log(`  → ${AZURE_BASE}  (api-version=${API_VERSION})`)
