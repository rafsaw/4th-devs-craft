import { chat } from "./ai.js";
import * as sum from "./tools/sum.js";
import * as generateImage from "./tools/generate_image.js";
import * as search from "./tools/search.js";
import * as scrape from "./tools/scrape.js";

const tools = [sum, generateImage, search, scrape];
const definitions = tools.map((tool) => tool.definition);

const history = [];

export async function agent(input, options = {}) {
  const { tracer } = options;

  tracer?.record("agent.session.start", { userMessage: input });

  history.push({ role: "user", content: input });

  for (let i = 0; i < 10; i++) {
    tracer?.record("agent.step.start", {
      step: i + 1,
      historyLength: history.length,
    });

    const answer = await chat(history, definitions, tracer);

    history.push(...answer.output);

    tracer?.record("agent.step.after_llm", {
      step: i + 1,
      hasMessage: !!answer.message,
      functionCallCount: answer.calls.length,
      outputTypes: answer.output.map((o) => o.type),
    });

    if (answer.message) {
      tracer?.record("agent.final", {
        step: i + 1,
        message: answer.message,
      });
      return answer.message;
    }

    await execute(answer.calls, history, tracer);
  }

  tracer?.record("agent.max_steps", { maxSteps: 10 });
}

async function execute(calls, history, tracer) {
  for (const call of calls) {
    const tool = tools.find((t) => t.definition.name === call.name);
    let args;
    try {
      args = JSON.parse(call.arguments);
    } catch (err) {
      tracer?.record("tool.error", {
        tool: call.name,
        phase: "parse_arguments",
        call_id: call.call_id,
        argumentsRaw: call.arguments,
        message: err?.message ?? String(err),
      });
      throw err;
    }

    tracer?.record("tool.execute", {
      tool: call.name,
      call_id: call.call_id,
      arguments: args,
      notes: "Tool picked by matching the name of the tool to the name of the function call in the LLM response",
    });

    console.log(args);

    try {
      const result = await tool.execute(args, tracer);
      console.log(result);
      tracer?.record("tool.result", {
        tool: call.name,
        call_id: call.call_id,
        result,
      });
      history.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    } catch (err) {
      tracer?.record("tool.error", {
        tool: call.name,
        call_id: call.call_id,
        message: err?.message ?? String(err),
      });
      throw err;
    }
  }
}
