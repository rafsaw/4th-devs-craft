import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  redactSecrets,
  compactImageFieldsInCopy,
} from "../trace-logger.js";

const OUTPUT_DIR = resolve("output");
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

export const definition = {
  type: "function",
  name: "generate_image",
  description:
    "Generates an image from a text prompt using Gemini Nano Banana 2 and saves it to disk",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Text description of the image to generate",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
};

export const execute = async ({ prompt }, tracer) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const body = {
    model: "gemini-3.1-flash-image-preview",
    input: prompt,
    response_modalities: ["IMAGE"],
  };
  const headers = {
    "Content-Type": "application/json",
    "x-goog-api-key": process.env.GEMINI_API_KEY,
  };

  tracer?.record(
    "integration.request",
    redactSecrets({
      service: "gemini",
      operation: "interactions",
      url: GEMINI_URL,
      method: "POST",
      headers,
      body,
    })
  );

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { parseError: true, raw: responseText };
  }

  tracer?.record("integration.response", {
    service: "gemini",
    operation: "interactions",
    url: GEMINI_URL,
    status: res.status,
    ok: res.ok,
    body: compactImageFieldsInCopy(data),
  });

  if (!res.ok) {
    throw new Error(
      `Gemini API error (${res.status}): ${responseText}`
    );
  }

  const image = data.outputs?.find((o) => o.type === "image");

  if (!image) {
    throw new Error("No image returned from Gemini API");
  }

  const filename = `image_${Date.now()}.png`;
  const filepath = resolve(OUTPUT_DIR, filename);
  writeFileSync(filepath, Buffer.from(image.data, "base64"));

  return { filepath, filename };
};
