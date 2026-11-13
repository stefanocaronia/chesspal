// What a command is and what it runs with: the definition and the reading of its input, and the context of folders, time and randomness.
export { type Caller, type Context, defaultContext, homeForOneCall, type SeenPosition, speaksItalian } from "./context.ts";
export { type AnyCommand, baseType, type Command, commandLineFieldProblem, defineCommand, inputProblems, isBoolean, isList, sentence, takesNumbers } from "./registry.ts";
