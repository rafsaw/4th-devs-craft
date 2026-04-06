import { redactSecrets } from "./trace-logger.js";

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
      body: requestBody,
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
    body: data,
  });

  if (!res.ok) {
    tracer?.record("llm.error", { status: res.status, body: data });
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
