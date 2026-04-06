/**
 * trace-logger.js — per-run event recorder, inspired by 01_03_zadanie/src/tracer.js.
 *
 * Pattern: create a tracer at startup, pass it as a dependency to every layer.
 * Each layer calls tracer.record(type, data) with domain-specific event types.
 * At the end, the entire event array is dumped as one readable JSON file under `logs/`.
 *
 * Event data is stored as recorded (after JSON clone): tool names and arguments stay
 * plain strings/objects — no numeric indirection.
 *
 * Event types by layer:
 *   app.*           — startup, shutdown, session lifecycle
 *   agent.*         — orchestration loop (step start, tool dispatch, final answer)
 *   llm.request     — outgoing LLM API call (model, input size, tools)
 *   llm.response    — LLM response (tokens, tool calls, text)
 *   llm.error       — LLM API failure
 *   vision.request  — outgoing vision API call
 *   vision.response — vision result
 *   tool.*          — tool execution (start, result, error)
 *   integration.*   — outbound HTTP to Firecrawl, Gemini, etc. (request/response bodies)
 *   verify.*        — declaration verification attempts
 *   validation.*    — local pre-verify checks
 *
 * Usage:
 *   const tracer = createTracer(sessionId);
 *   tracer.record("agent.step.start", { step: 1, messageCount: 3 });
 *   await tracer.save();
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** Repo root (this file lives at project root). */
const PROJECT_ROOT = __dirname;
const LOGS_DIR = join(PROJECT_ROOT, "logs");

const cloneJsonSafe = (value) => {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { nonSerializable: String(value) };
  }
};

const SENSITIVE_KEY = /^(authorization|x-goog-api-key|api[-_]?key|password|secret|token|bearer)$/i;

/**
 * Deep-clone and replace sensitive header keys and nested object keys with "[REDACTED]".
 */
export const redactSecrets = (value, depth = 0) => {
  if (depth > 30) return "[max depth]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(k) || SENSITIVE_KEY.test(String(k))) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out;
};

/**
 * Shrink Gemini (or similar) image payloads for JSON traces — keeps structure, drops huge base64.
 */
export const compactImageFieldsInCopy = (value, depth = 0) => {
  if (depth > 30) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => compactImageFieldsInCopy(item, depth + 1));
  if (typeof value !== "object") return value;
  const out = { ...value };
  if (out.type === "image" && typeof out.data === "string") {
    out.data = `[base64 omitted, length=${out.data.length}]`;
  }
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (v !== null && typeof v === "object") {
      out[key] = compactImageFieldsInCopy(v, depth + 1);
    }
  }
  return out;
};

export const createTracer = (sessionId = "unknown") => {
  const startedAt = new Date().toISOString();
  const events = [];
  const slug = startedAt.replace(/[:.]/g, "-");
  const outputPath = join(LOGS_DIR, `${sessionId}--${slug}.json`);

  const record = (type, data = {}) => {
    const payload = cloneJsonSafe(data);
    events.push({
      index: events.length + 1,
      timestamp: new Date().toISOString(),
      type,
      data: payload,
    });
  };

  const save = async () => {
    await mkdir(LOGS_DIR, { recursive: true });
    const payload = {
      sessionId,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(startedAt).getTime(),
      eventsCount: events.length,
      eventTypes: [...new Set(events.map((e) => e.type))],
      events,
    };
    await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    return outputPath;
  };

  return { record, save, path: outputPath, events };
};
