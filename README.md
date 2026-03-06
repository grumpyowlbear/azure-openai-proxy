# azure-openai-proxy

A tiny Bun proxy that lets OpenAI SDK-based tools (like [OpenCode](https://opencode.ai)) talk to **Azure OpenAI** endpoints — including **Responses API** models (Codex, etc.) that the SDK can't reach directly.

## Why?

Azure OpenAI requires `?api-version=` on every request. The OpenAI SDK doesn't add this — especially for the **Responses API** (`/responses` endpoint used by Codex models). This proxy sits in between and fixes the URL on the fly.

| API | SDK sends | Azure expects |
|-----|-----------|---------------|
| Chat Completions | `/deployments/{model}/chat/completions` | Same + `?api-version=` |
| **Responses** | `/responses` (model in body) | `/openai/responses?api-version=` |

## Quick start

```bash
git clone https://github.com/grumpyowlbear/azure-openai-proxy.git
cd azure-openai-proxy

export AZURE_OPENAI_BASE_URL="https://YOUR-RESOURCE.cognitiveservices.azure.com/openai"
bun proxy.mjs
```

The proxy listens on `http://localhost:18924` by default.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_OPENAI_BASE_URL` | _(required)_ | Your Azure OpenAI base URL |
| `AZURE_API_VERSION` | `2025-03-01-preview` | Azure API version string |
| `UPSTREAM_TIMEOUT_MS` | `1800000` | Hard cap on the outbound fetch to Azure in milliseconds (30 min default, `0` disables) |
| `PORT` | `18924` | Local port to listen on |

## OpenCode setup

Copy `example-opencode-config.json` to `~/.config/opencode/config.json` and fill in your values.

Use **two providers** — one direct to Azure for Chat Completions, one through the proxy for Responses API models:

```json
{
  "provider": {
    "azure-cognitive-services": {
      "options": {
        "apiKey": "YOUR_KEY",
        "baseURL": "https://YOUR-RESOURCE.cognitiveservices.azure.com/openai",
        "useCompletionUrls": true,
        "useDeploymentBasedUrls": true
      },
      "models": {
        "gpt-5.3-chat": { "name": "GPT 5.3 Chat" }
      }
    },
    "openai": {
      "options": {
        "apiKey": "YOUR_KEY",
        "baseURL": "http://localhost:18924"
      },
      "models": {
        "gpt-5.1-codex-mini": { "name": "GPT 5.1 Codex Mini" }
      }
    }
  }
}
```

Switch models in OpenCode with `/model`.

## How it works

```
OpenCode → openai provider → http://localhost:18924/responses
                                        ↓
                              proxy appends ?api-version=
                              proxy converts Bearer → api-key header
                              proxy streams SSE responses through
                                        ↓
                              https://YOUR-RESOURCE.../openai/responses?api-version=...
                                        ↓
                                   Azure OpenAI ✓
```

## Known issues

- **`developer` role bug**: `@ai-sdk/openai` assumes certain model IDs are "reasoning models" and sends `role: "developer"` instead of `role: "system"`. This can break non-OpenAI models on Azure when using the Responses API path. Chat Completions path (`useCompletionUrls: true`) is not affected.

## License

MIT
