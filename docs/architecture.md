# Architecture — 4th-devs-craft

This document describes how the project is structured, how control and data move through it, and how it talks to external services. Diagrams use [Mermaid](https://mermaid.js.org/); they render in GitHub, many IDEs, and static site generators.

---

## 1. Purpose in one paragraph

The app is a **minimal tool-calling agent**: a user prompt is kept in a **conversation history**, sent to **OpenAI’s Responses API** (`gpt-4o`) together with **JSON Schema–style function definitions**. When the API returns **function calls**, Node **executes** the matching local modules, appends **function outputs** to the history, and **loops** until the API returns a final **assistant message** (or until a **maximum iteration** count). Optional tools call **Google Gemini** (image generation) and **Firecrawl** (search and scrape).

---

## 2. System context

Who talks to whom at the highest level.

```mermaid
flowchart LR
  subgraph Runtime["Local Node.js process"]
    APP[app.js]
    AG[agent.js]
    AI[ai.js]
    TOOLS[tools/*.js]
    APP --> AG
    AG --> AI
    AG --> TOOLS
  end

  USER((Operator))
  OAI["OpenAI API<br/>gpt-4o /v1/responses"]
  GEM["Google Generative Language<br/>Gemini interactions"]
  FC["Firecrawl API v2"]

  USER -->|runs| APP
  AI -->|HTTPS + OPENAI_API_KEY| OAI
  TOOLS -->|HTTPS + GEMINI_API_KEY| GEM
  TOOLS -->|HTTPS + FIRECRAWL_API_KEY| FC
```

---

## 3. Module map and dependencies

Files and import direction only (no runtime loop shown here).

```mermaid
flowchart TB
  app[app.js]
  agent[agent.js]
  ai[ai.js]
  sum[tools/sum.js]
  gen[tools/generate_image.js]
  search[tools/search.js]
  scrape[tools/scrape.js]

  app --> agent
  agent --> ai
  agent --> sum
  agent --> gen
  agent --> search
  agent --> scrape
```

---

## 4. Tool plugin contract

Each tool module is two exports: a **definition** (sent to OpenAI) and an **execute** (run locally).

```mermaid
classDiagram
  class ToolModule {
    +Object definition
    +execute(args) Promise~any~ or any
  }

  class definition {
    +string type
    +string name
    +string description
    +Object parameters
    +boolean strict
  }

  ToolModule *-- definition : exports
```

Note: `definition.type` is the literal string `function` in the JSON sent to OpenAI.

`agent.js` builds:

- `definitions` — `tools.map(t => t.definition)` passed into every `chat()` call.
- `execute(calls, history)` — for each OpenAI `function_call`, finds the tool by `name`, `JSON.parse`s `arguments`, calls `tool.execute(args)`, then pushes a history item with `type: "function_call_output"`.

---

## 5. Conversation history shape (conceptual)

The `history` array mixes **user turns** and **raw API output blocks**. Roughly:

| Source | What gets appended |
|--------|---------------------|
| User | `{ role: "user", content: string }` |
| After each `chat()` | Spread of `data.output` from OpenAI (`...answer.output`) |
| After each tool | `{ type: "function_call_output", call_id, output: JSON string }` |

The next request sends the **entire** `history` plus **tool definitions** again (`chat(history, definitions)`).

---

## 6. Main agent loop (activity)

```mermaid
flowchart TD
  A([agent called with user text]) --> B[Push user message to history]
  B --> C{i less than 10?}
  C -->|no| Z([Stop — no final message returned])
  C -->|yes| D[chat history + tool definitions]
  D --> E[POST OpenAI /v1/responses]
  E --> F[Append full response output to history]
  F --> G{Assistant message present?}
  G -->|yes| H([Return message text])
  G -->|no| I[execute all function calls]
  I --> J[For each call: run tool, push function_call_output]
  J --> K[Increment loop / next i]
  K --> C
```

**Exit conditions:**

- **Success:** `answer.message` is set — first `output` item with `type === "message"` has extractable text (`message?.content[0].text`).
- **Implicit stop:** after **10 iterations** without returning, the function falls off the end and returns **`undefined`**.

---

## 7. Sequence — end-to-end (multi-turn tool use)

Typical flow: user asks something that needs search and/or tools, then the model answers in natural language.

```mermaid
sequenceDiagram
  autonumber
  participant App as app.js
  participant Agent as agent.js
  participant Chat as ai.js chat
  participant OAI as OpenAI Responses API
  participant Exec as execute + tools

  App->>Agent: agent(userPrompt)
  Agent->>Agent: history.push user message

  loop Up to 10 rounds
    Agent->>Chat: chat(history, definitions)
    Chat->>OAI: POST /v1/responses model gpt-4o
    OAI-->>Chat: JSON output array
    Chat-->>Agent: message?, calls, output

    Agent->>Agent: history.push ...output

    alt Final assistant message
      Agent-->>App: return message text
    else One or more function_call items
      Agent->>Exec: execute(calls, history)
      Exec->>Exec: For each call: parse args, tool.execute
      Exec->>Agent: push function_call_output entries
    end
  end
```

---

## 8. Sequence — `chat()` and OpenAI response handling

```mermaid
sequenceDiagram
  participant Agent as agent.js
  participant Chat as ai.js
  participant OAI as OpenAI

  Agent->>Chat: chat(input, tools)
  Chat->>OAI: POST /v1/responses
  Note over Chat,OAI: Body: model, input, tools

  OAI-->>Chat: data.output[]

  Chat->>Chat: find type message
  Chat->>Chat: filter type function_call
  Chat-->>Agent: message text or undefined, calls[], output
```

**Coupling note:** `chat()` assumes a final assistant message exposes text at `message.content[0].text`. If the API shape changes or returns multiple content parts, this should be revisited.

---

## 9. Sequence — executing a batch of tool calls

`execute` runs calls **sequentially** in array order.

```mermaid
sequenceDiagram
  participant Agent as agent.js
  participant Exec as execute()
  participant TM as Tool module
  participant Hist as history array

  Agent->>Exec: execute(calls, history)

  loop For each function_call
    Exec->>Exec: find tool by definition.name
    Exec->>Exec: JSON.parse call.arguments
    Exec->>TM: execute(args)
    TM-->>Exec: result
    Exec->>Hist: push function_call_output
  end

  Exec-->>Agent: void
```

If a tool **throws**, the error propagates and the agent loop **does not** catch it — the process fails fast unless wrapped at a higher level.

---

## 10. Sequence — `sum` (local, no network)

```mermaid
sequenceDiagram
  participant Exec as execute()
  participant Sum as tools/sum.js

  Exec->>Sum: execute({ a, b })
  Sum-->>Exec: a + b number
```

---

## 11. Sequence — `generate_image` (Gemini)

```mermaid
sequenceDiagram
  participant Exec as execute()
  participant Gen as generate_image.js
  participant FS as Local filesystem
  participant API as generativelanguage.googleapis.com

  Exec->>Gen: execute({ prompt })
  Gen->>FS: mkdir output if needed
  Gen->>API: POST /v1beta/interactions
  Note over Gen,API: x-goog-api-key GEMINI_API_KEY<br/>model gemini-3.1-flash-image-preview<br/>response_modalities IMAGE

  API-->>Gen: outputs includes base64 image
  Gen->>FS: writeFileSync output/image_timestamp.png
  Gen-->>Exec: { filepath, filename }
```

---

## 12. Sequence — `web_search` (Firecrawl)

```mermaid
sequenceDiagram
  participant Exec as execute()
  participant S as tools/search.js
  participant FC as api.firecrawl.dev

  Exec->>S: execute({ query, limit })
  S->>FC: POST /v2/search
  Note over S,FC: Bearer FIRECRAWL_API_KEY<br/>scrapeOptions markdown

  FC-->>S: data.web[]
  S-->>Exec: mapped titles urls descriptions markdown
```

---

## 13. Sequence — `scrape_url` (Firecrawl)

```mermaid
sequenceDiagram
  participant Exec as execute()
  participant Sc as tools/scrape.js
  participant FC as api.firecrawl.dev

  Exec->>Sc: execute({ url })
  Sc->>FC: POST /v2/scrape
  Note over Sc,FC: Bearer FIRECRAWL_API_KEY<br/>formats markdown

  FC-->>Sc: data markdown + metadata
  Sc-->>Exec: url title description markdown
```

---

## 14. Deployment / runtime view

No container orchestration: a single **Node process**, env vars from `.env` (e.g. `node --env-file=.env app.js` on supported Node versions).

```mermaid
flowchart TB
  subgraph Process["Node.js process"]
    E[process.env OPENAI GEMINI FIRECRAWL]
    L[agent loop]
    E -.-> L
    L --> D[(output/*.png from generate_image)]
  end
```

---

## 15. Security and secrets

- **Keys** travel only in **HTTPS** headers (`Authorization` / `x-goog-api-key` / Firecrawl bearer).
- **`.env`** must stay local; it is gitignored in this repo pattern.
- **Tool implementations** should treat arguments as **untrusted** if the app ever exposes `agent()` to end users (currently `app.js` is a trusted local entry).

---

## 16. Implementation caveats (important for evolving the codebase)

1. **Shared `history`:** In `agent.js`, `history` is a **module-level array**. Every `agent()` invocation **appends to the same** list, so concurrent or sequential **independent** conversations are not isolated unless you refactor to per-call history (or reset the array deliberately).

2. **Loop cap:** Ten iterations is a **safety bound**; complex tasks might need a higher cap or adaptive stopping.

3. **No streaming:** `chat()` waits for the full HTTP response; there is no token streaming or partial UI updates.

4. **Tool registration:** New tools require both a new file and an entry in the `tools` array in `agent.js`.

5. **OpenAI response parsing:** Only the **first** message block and **first** text content slice are used for the return value; richer multimodal outputs are not surfaced.

---

## 17. Related documentation

- `README.md` — setup and run instructions.
- `docs/openai.md`, `docs/gemini.md`, `docs/firecrawl.md` — API-oriented notes aligned with this architecture.
