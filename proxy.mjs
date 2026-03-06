#!/usr/bin/env bun

// Azure OpenAI Proxy
// Bridges OpenAI SDK → Azure OpenAI by appending ?api-version= to all requests.
// This lets tools like OpenCode use Azure-hosted models (including Responses API
// models like Codex) that the SDK can't reach directly due to URL pattern mismatches.

const RAW_AZURE_BASE =
  process.env.AZURE_OPENAI_BASE_URL ||
  "https://YOUR-RESOURCE.cognitiveservices.azure.com/openai"
const AZURE_BASE = RAW_AZURE_BASE.replace(/\/+$/, "")

const API_VERSION = process.env.AZURE_API_VERSION || "2025-03-01-preview"
const PORT = parseInt(process.env.PORT || "18924", 10)
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || "1800000", 10)

if (AZURE_BASE.includes("YOUR-RESOURCE")) {
  console.error(
    "Set AZURE_OPENAI_BASE_URL or edit proxy.mjs with your Azure resource URL.",
  )
  process.exit(1)
}

Bun.serve({
  port: PORT,
  idleTimeout: 255, // max seconds to keep connection alive between chunks (default 10)
  async fetch(req, server) {
    server.timeout(req, 0) // disable per-request timeout for long-running streams
    const url = new URL(req.url)
    const target = new URL(AZURE_BASE)
    target.pathname = `${target.pathname.replace(/\/+$/, "")}${url.pathname}`
    target.search = url.search
    target.searchParams.set("api-version", API_VERSION)

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
        signal:
          UPSTREAM_TIMEOUT_MS > 0
            ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
            : undefined,
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
console.log(
  `  → ${AZURE_BASE}  (api-version=${API_VERSION}, fetch-timeout=${UPSTREAM_TIMEOUT_MS ? UPSTREAM_TIMEOUT_MS + "ms" : "none"})`,
)
