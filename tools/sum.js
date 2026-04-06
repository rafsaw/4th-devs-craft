export const definition = {
    type: "function",
    name: "sum",
    description: "Returns the sum of two numbers",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
  };
  
export const execute = async ({ a, b }, tracer) => {
    tracer?.record("sum.tool.execute", {
        tool: "sum",
        arguments: { a, b },
    });
    const result = await a + b;
    tracer?.record("sum.tool.result", {
        tool: "sum",
        arguments: { a, b },
        result,
    });
    return result;
};