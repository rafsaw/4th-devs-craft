import { createTracer } from "./trace-logger.js";
import { agent } from "./agent.js";

const sessionId = `session-${Date.now()}`;
const tracer = createTracer(sessionId);

tracer.record("app.start", { sessionId });

// const prompt = "Write up the specs for the AirPods Max 2, which were released yesterday.";
const prompt = "Create a wide landscape illustration of the Yamaha FJR1300, no text.";
try {
  const answer = await agent(
    prompt,
    { tracer }
  );
  console.log(answer);
  tracer.record("app.done", { ok: true });
} catch (err) {
  tracer.record("app.error", { message: err?.message ?? String(err) });
  throw err;
} finally {
  const logPath = await tracer.save();
  console.error("Trace log:", logPath);
}
