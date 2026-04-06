import { redactSecrets } from "../trace-logger.js";

const BASE_URL = "https://api.firecrawl.dev/v2";

export const definition = {
  type: "function",
  name: "web_search",
  description:
    "Searches the web for a given query and returns results with markdown content",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The search query (supports operators like site:, filetype:, intitle:)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (1-100, default 5)",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export const execute = async ({ query, limit = 5 }, tracer) => {
  const requestUrl = `${BASE_URL}/search`;
  const body = {
    query,
    limit,
    scrapeOptions: {
      formats: [{ type: "markdown" }],
    },
  };
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
  };

  tracer?.record(
    "integration.request",
    redactSecrets({
      service: "firecrawl",
      operation: "search",
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

  tracer?.record("integration.response", {
    service: "firecrawl",
    operation: "search",
    url: requestUrl,
    status: res.status,
    ok: res.ok,
    body: parsed,
  });

  if (!res.ok) {
    const error = typeof parsed === "object" && parsed.raw ? responseText : JSON.stringify(parsed);
    throw new Error(`Firecrawl search error (${res.status}): ${error}`);
  }

  const { data } = parsed;

  return (data?.web ?? []).map(({ title, url, description, markdown }) => ({
    title,
    url,
    description,
    markdown: markdown ?? null,
  }));
};
