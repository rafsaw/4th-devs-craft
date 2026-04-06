import { redactSecrets } from "../trace-logger.js";

const BASE_URL = "https://api.firecrawl.dev/v2";

export const definition = {
  type: "function",
  name: "scrape_url",
  description: "Scrapes a single URL and returns its content as markdown",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to scrape",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

export const execute = async ({ url }, tracer) => {
  const requestUrl = `${BASE_URL}/scrape`;
  const body = {
    url,
    formats: [{ type: "markdown" }],
  };
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
  };

  tracer?.record(
    "Tool.request",
    redactSecrets({
      service: "firecrawl",
      operation: "scrape",
      url: requestUrl,
      method: "POST",
      headers,
      body,
    })
  );

  const res = await fetch(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = { parseError: true, raw: responseText };
  }

  tracer?.record("tool.result", {
    service: "firecrawl",
    operation: "scrape",
    url: requestUrl,
    status: res.status,
    ok: res.ok,
    body: parsed,
  });

  if (!res.ok) {
    const error = typeof parsed === "object" && parsed.raw ? responseText : JSON.stringify(parsed);
    throw new Error(`Firecrawl scrape error (${res.status}): ${error}`);
  }

  const { data } = parsed;

  return {
    url: data?.metadata?.url ?? url,
    title: data?.metadata?.title ?? null,
    description: data?.metadata?.description ?? null,
    markdown: data?.markdown ?? null,
  };
};
