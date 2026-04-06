# 4th-devs-craft

A small Node.js agent that uses the [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses) (`gpt-4o`) with function calling. The model can call tools for math, image generation, web search, and page scraping.

## Requirements

- **Node.js** 18 or newer (uses native `fetch` and ES modules)

The project uses ES module `import`/`export`. If running fails with a module error, add a `package.json` that includes `"type": "module"`.

## Setup

1. Copy the environment template and fill in your keys (e.g. `Copy-Item env.example .env` in PowerShell, or `cp env.example .env` on macOS/Linux).

2. Set variables in `.env`:

   | Variable | Used for |
   |----------|----------|
   | `OPENAI_API_KEY` | Chat / agent loop (required to run the agent) |
   | `GEMINI_API_KEY` | `generate_image` tool (Gemini image API) |
   | `FIRECRAWL_API_KEY` | `web_search` and `scrape_url` tools |

## Run

From the project root:

```bash
node app.js
```

`app.js` sends a sample prompt to the agent. Edit the string in `app.js` to try other tasks.

## How it works

- **`ai.js`** — POSTs to `https://api.openai.com/v1/responses` with the conversation and tool definitions.
- **`agent.js`** — Loops: model reply → if it returns function calls, runs matching tools from `tools/` and feeds results back → repeats until the model returns a final message (up to 10 iterations).

## Tools (`tools/`)

| Tool | Description |
|------|-------------|
| `sum` | Adds two numbers (demo / simple arithmetic). |
| `generate_image` | Generates a PNG from a text prompt via Gemini and saves it under `output/`. |
| `web_search` | Web search via Firecrawl v2 (`/search`), returns markdown snippets. |
| `scrape_url` | Scrapes one URL via Firecrawl v2 (`/scrape`), returns markdown. |

## Docs

Extra API notes live under `docs/` (`openai.md`, `gemini.md`, `firecrawl.md`).

## License

Add a license if you publish this repository.
