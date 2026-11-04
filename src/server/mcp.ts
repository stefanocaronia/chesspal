import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type Context, defaultContext } from "../commands/context.ts";
import { commands } from "../commands/index.ts";
import { type AnyCommand, inputProblems, isBoolean } from "../commands/registry.ts";
import { version } from "../version.ts";
import { pagePorts } from "./bell.ts";
import { chatHasRead, startPage } from "./page.ts";

/** What the host reads as the server starts, before any tool: where to begin, and the rule of every move (D-27). Short, since hosts may cut it. */
export const serverInstructions = "Chesspal keeps the chess for you: the rules, the board, the clock, the games and the player's memory. Call `status` at the start of every "
    + "chat. Every move goes through Chesspal's tools: never keep the board in your head or invent a position.";

/** The MCP server for an AI host: every command of the registry as a tool, with its description and parameters (D-5). */
export function createMcpServer(context: Context = defaultContext(), list: AnyCommand[] = commands): McpServer
{
    const server = new McpServer({ name: "chesspal", version }, { instructions: serverInstructions });

    for (const command of list.filter((each) => each.cliOnly !== true)) {
        server.registerTool(command.name, toolConfig(command), (input: unknown) => track(runTool(command, input, context)));
    }

    return server;
}

/**
 * Serves the tools over standard input and output, as AI hosts expect: stdout carries the protocol alone, so nothing else may print there. It ends when the
 * host goes and its input closes, once the calls still running have answered: a move half made would be lost.
 */
export async function startMcpServer(context: Context = defaultContext(), list: AnyCommand[] = commands): Promise<void>
{
    const leave = async (): Promise<void> => {
        // A tool stuck on something that never ends must not keep the server alive once the host has gone.
        await Promise.race([Promise.allSettled(running), new Promise((done) => setTimeout(done, 5_000))]);
        // The SDK sends the answer a moment after the call ends: it must reach stdout before the process goes.
        setImmediate(() => process.stdout.write("", () => process.exit(0)));
    };

    process.stdin.on("end", leave);
    process.stdin.on("close", leave);
    const server = createMcpServer(context, list);
    context.host = () => server.server.getClientVersion()?.name;
    context.page = await pageOf(context, () => opponentOf(context.host?.()));
    await server.connect(new StdioServerTransport());
}

/** The opponent's name for the page, from the host's: Claude Code and the desktop app are Claude, Codex is Codex; another host is unnamed. */
export function opponentOf(host: string | undefined): string | undefined
{
    return /claude/i.test(host ?? "") ? "Claude" : /codex/i.test(host ?? "") ? "Codex" : undefined;
}

/** The board page of the player's folder, served by this process for as long as the chat lasts (D-47); without it the game goes on in the chat. */
async function pageOf(context: Context, opponent: () => string | undefined): Promise<string | undefined>
{
    try {
        const { url, heard } = await startPage(context, opponent);
        // Words the AI is given change no file: the pages hear of them from the commands.
        context.heard = heard;

        if (!pagePorts(context.folder).includes(Number(new URL(url).port))) {
            process.stderr.write(`The board page is at ${url}, off its usual ports: the doorbell cannot find it, so moves on the page do not wake the chat.\n`);
        }

        return url;
    } catch (error) {
        // The host keeps what the server writes on stderr in its logs.
        process.stderr.write(`${(error as Error).message}\n`);
        return undefined;
    }
}

// The tool calls still running, which the server waits for before it leaves.
const running = new Set<Promise<CallToolResult>>();

function track(call: Promise<CallToolResult>): Promise<CallToolResult>
{
    running.add(call);
    void call.finally(() => running.delete(call));
    return call;
}

/** Every hint stated, since the spec reads a missing one as the worst case: everything is local, so no tool reaches the open world. */
function toolConfig(command: AnyCommand)
{
    const readOnly = command.readOnly === true;
    const annotations = { readOnlyHint: readOnly, destructiveHint: command.destructive === true, idempotentHint: readOnly || command.idempotent === true, openWorldHint: false };
    const meta = command.alwaysLoad ? { "anthropic/alwaysLoad": true } : undefined;
    // The SDK writes the draft's address in every schema: it says nothing to an AI, and costs tokens in every tool.
    return { description: command.description, inputSchema: z.looseObject({}).meta({ ...shownInput(command), $schema: undefined }), annotations, _meta: meta };
}

async function runTool(command: AnyCommand, input: unknown, context: Context): Promise<CallToolResult>
{
    try {
        const result: unknown = await command.run(checkedInput(command, input), context);
        return { content: [{ type: "text", text: command.format(result) }] };
    } catch (error) {
        return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    } finally {
        // What the tool read or wrote, the chat has seen: the doorbell rings it only for what changes after.
        chatHasRead(context);
    }
}

type ShownInput = z.core.JSONSchema.BaseSchema & { properties?: Record<string, { description?: string; }>; required?: string[]; };

// The JSON schema of each command's input, as the SDK would write it from the strict schema: the tool takes any object, and the command checks it, so that
// what is wrong comes back in words an AI can act on.
const shownInputs = new WeakMap<AnyCommand, ShownInput>();

function shownInput(command: AnyCommand): ShownInput
{
    let shown = shownInputs.get(command);

    if (shown === undefined) {
        shown = z.toJSONSchema(command.input.strict(), { target: "draft-7", io: "input" }) as ShownInput;
        shownInputs.set(command, shown);
    }

    return shown;
}

/** The command's input, checked as its schema says; what is wrong comes with every parameter the tool takes, for a call made without the schema. */
function checkedInput(command: AnyCommand, input: unknown): unknown
{
    const parsed = (command.input as z.ZodObject).strict().safeParse(withFlags(command, input ?? {}));

    if (parsed.success) {
        return parsed.data;
    }

    const given = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
    const shown = shownInput(command);
    const required = shown.required ?? [];
    const parameters = Object.entries(shown.properties ?? {}).map(([name, field]) => `- ${name}${required.includes(name) ? "" : " (optional)"}${field.description === undefined ? "" : `: ${field.description}`}`);
    const again = parameters.length === 0 ? "call it again with no parameters." : `call it again with its parameters.\n${command.name} takes:\n${parameters.join("\n")}`;
    throw new Error(`${inputProblems(command.name, parsed.error.issues, given, (name) => name)} Nothing changed: ${again}`);
}

/** The input with "true" and "false" as flags where the command takes one: some hosts send every value as text. */
function withFlags(command: AnyCommand, input: unknown): unknown
{
    if (typeof input !== "object" || input === null) {
        return input;
    }

    const { shape } = command.input as z.ZodObject;
    return Object.fromEntries(
        Object.entries(input).map(([name, value]) => {
            const field = shape[name];
            return [name, field !== undefined && isBoolean(field) && (value === "true" || value === "false") ? value === "true" : value];
        }),
    );
}
