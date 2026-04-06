# 4th-devs-craft

A small Node.js agent that uses the [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses) (`gpt-4o`) with function calling. The model can call tools for math, image generation, web search, and page scraping.

## Requirements

- **Node.js** 18 or newer (uses native `fetch` and ES modules). The run command below uses `[--env-file](https://nodejs.org/api/cli.html#--env-fileconfig)`, which needs **Node.js 20.6+**; on older versions, set the same variables in your environment another way.

The project uses ES module `import`/`export`. If running fails with a module error, add a `package.json` that includes `"type": "module"`.

## Setup

1. Copy the environment template and fill in your keys (e.g. `Copy-Item env.example .env` in PowerShell, or `cp env.example .env` on macOS/Linux).
2. Set variables in `.env`:

  | Variable            | Used for                                      |
  | ------------------- | --------------------------------------------- |
  | `OPENAI_API_KEY`    | Chat / agent loop (required to run the agent) |
  | `GEMINI_API_KEY`    | `generate_image` tool (Gemini image API)      |
  | `FIRECRAWL_API_KEY` | `web_search` and `scrape_url` tools           |


## Run

From the project root:

```bash
node --env-file=.env app.js
```

This reads API keys from `.env`.

### Using the agent for research, images, scraping, or summing two numbers

There is no separate CLI flag. You **edit the prompt string** in `app.js` (the argument to `agent(...)`) and run the same command again. The model reads your request and decides which tools to call (`web_search`, `scrape_url`, `generate_image`, or `sum`).


| Goal                                                 | Also set in `.env`                    | What to ask (examples)                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sum two numbers** (`sum` tool — demo arithmetic)   | No extra keys (only `OPENAI_API_KEY`) | `"What is 47.2 plus 93?"` — `"Add 12 and 198 and tell me the result."` — `"Use your tools to compute the sum of 3.14 and 2.86."`                                                   |
| **Research** (find and synthesize info from the web) | `FIRECRAWL_API_KEY`                   | `"Research the latest EU AI Act implementation timeline and summarize with bullet points."` — `"Compare three reviews of [product]: search the web, then give a short verdict."`   |
| **Generate an image**                                | `GEMINI_API_KEY`                      | `"Generate an image: a minimal flat vector app icon for a note-taking app, soft blue and white."` — `"Create a wide landscape illustration of a coastal town at sunset, no text."` |
| **Scrape pages** (read specific URLs as markdown)    | `FIRECRAWL_API_KEY`                   | `"Scrape https://example.com/docs and summarize the installation steps."` — `"Fetch https://… and https://…, then compare the pricing sections."`                                  |


`**OPENAI_API_KEY`** is required for every run (the orchestration model). If a tool’s key is missing, that tool’s API call will fail when the model tries to use it—set the keys for the capabilities you want.

Saved images from `generate_image` appear under the `output/` directory (see `tools/generate_image.js`).

## How it works

- `**ai.js**` — POSTs to `https://api.openai.com/v1/responses` with the conversation and tool definitions.
- `**agent.js**` — Loops: model reply → if it returns function calls, runs matching tools from `tools/` and feeds results back → repeats until the model returns a final message (up to 10 iterations).

## Tools (`tools/`)


| Tool             | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `sum`            | Adds two numbers (demo / simple arithmetic).                                |
| `generate_image` | Generates a PNG from a text prompt via Gemini and saves it under `output/`. |
| `web_search`     | Web search via Firecrawl v2 (`/search`), returns markdown snippets.         |
| `scrape_url`     | Scrapes one URL via Firecrawl v2 (`/scrape`), returns markdown.             |


## Docs

Extra API notes live under `docs/` (`openai.md`, `gemini.md`, `firecrawl.md`).

## License

Add a license if you publish this repository.