import { redactSecrets } from "./trace-logger.js";

/** Trace snapshot: same payload shape minus full `tools` list (count only). */
function llmRequestBodyForTrace(body) {
  const { model, input, tools } = body;
  return {
    model,
    input,
    toolCount: Array.isArray(tools) ? tools.length : 0,
  };
}

/**
 * For traces only: keep `output` (and `error` if present). The real HTTP JSON has
 * many more fields; see _traceNote so future readers know where to look.
 */
const LLM_RESPONSE_BODY_TRACE_NOTE =
  "OpenAI POST /v1/responses returns a large JSON object (e.g. id, model, usage, created_at, status, tool_choice, parallel_tool_calls, echoed tools list, billing fields, …). This log intentionally stores only `output` (assistant messages, function_call items, etc.), and `error` when the API returns it. For the full response schema, see the OpenAI Responses API reference for your stack date.";

function llmResponseBodyForTrace(data) {
  if (!data || typeof data !== "object") return data;
  if (data.parseError) return data;

  const slim = {
    output: Array.isArray(data.output) ? data.output : [],
    _traceNote: LLM_RESPONSE_BODY_TRACE_NOTE,
  };
  if (data.error != null) {
    slim.error = data.error;
  }
  return slim;
}

async function chat(input, tools, tracer) {
  const url = "https://api.openai.com/v1/responses";
  const requestBody = { model: "gpt-4o", input, tools };
  const requestHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  };

  tracer?.record(
    "llm.request",
    redactSecrets({
      url,
      method: "POST",
      headers: requestHeaders,
      body: llmRequestBodyForTrace(requestBody),
    })
  );

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    tracer?.record("llm.error", {
      phase: "fetch",
      message: err?.message ?? String(err),
    });
    throw err;
  }

  const responseText = await res.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { parseError: true, raw: responseText };
  }

  tracer?.record("llm.response", {
    status: res.status,
    ok: res.ok,
    body: llmResponseBodyForTrace(data),
  });

  if (!res.ok) {
    tracer?.record("llm.error", {
      status: res.status,
      body: llmResponseBodyForTrace(data),
    });
  }

  const message = data.output?.find((o) => o.type === "message");
  const calls = data.output?.filter((o) => o.type === "function_call") ?? [];

  return {
    message: message?.content?.[0]?.text,
    calls,
    output: data.output ?? [],
  };
}

export { chat };
