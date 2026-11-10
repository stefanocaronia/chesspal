// The MCP server an AI host starts: every command as a tool (D-5), and the board page served for as long as the chat lasts (D-47).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { aiMove, type AnyCommand, type Caller, commands, type Context, defaultContext, inputProblems, isBoolean, PositionChanged } from "../commands/index.ts";
import { aiNameOf } from "../core/index.ts";
import { endOf, loadGame, noteAiHost, noteAiModel } from "../games/index.ts";
import { agentTools, hasAgent } from "../host-files/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { version } from "../version.ts";
import { pagePorts } from "./bell.ts";
import { allowedCaller, callerOf, type CallingAgent, callingAgent, fromCodexAgent } from "./caller.ts";
import { chatHasRead, startPage } from "./page/page.ts";

/** What the host reads as the server starts, before any tool: where to begin, and the rule of every move (D-27). Short, since hosts may cut it. */
export const serverInstructions = "Chesspal keeps the chess for you: the rules, the board, the clock, the games and the player's memory. Call `status` at the start of every "
    + "chat. Every move goes through Chesspal's tools: never keep the board in your head or invent a position.";

/** The MCP server for an AI host: every command of the registry as a tool, with its description and parameters (D-5). */
export function createMcpServer(context: Context = defaultContext(), list: AnyCommand[] = commands, beforeCall?: (meta: Record<string, unknown> | undefined) => Promise<void>): McpServer
{
    const server = new McpServer({ name: "chesspal", version }, { instructions: serverInstructions });
    // The server keeps what it told the chat, the instructions a tool gives once, and the position it showed: none yet (D-71).
    context.told ??= new Set();
    context.positionSeen ??= null;
    // The host the chat runs in, as it introduced itself: it names the AI on the page and in the game's PGN (D-97).
    context.host ??= () => server.server.getClientVersion()?.name;

    const forSomeHosts: { hosts: readonly string[]; tool: { enable(): void; }; }[] = [];

    for (const command of list.filter((each) => each.cliOnly !== true)) {
        const tool = server.registerTool(command.name, toolConfig(command), async (input: unknown, extra) => {
            await beforeCall?.(extra._meta);
            const codexAgent = fromCodexAgent(extra._meta);
            const calling = command.byAgents !== undefined || codexAgent ? await callingAgent(extra._meta, context.folder) : undefined;

            // An agent's tool called by the chat, or by another agent, would give what only that agent may see (Priya).
            if (command.byAgents !== undefined && !allowedCaller(calling, command.byAgents)) {
                // It names no agent to start: the chat that asked would start one itself (Priya).
                return { content: [{ type: "text", text: `${command.name} is not yours to call: the player reads what it gives on the board page. Nothing changed.` }], isError: true };
            }

            // Codex gives its agents every tool: one of Chesspal's keeps to its own, and never plays or talks for the opponent (D-98, Federico).
            const own = calling !== undefined && "agent" in calling ? agentTools(calling.agent) : undefined;

            if (codexAgent && own !== undefined && !own.includes(command.name)) {
                return { content: [{ type: "text", text: `${command.name} is not yours to call: you work only with ${own.join(", ")}. Nothing changed.` }], isError: true };
            }

            // Each call knows who makes it, for the commands that write it down (D-81).
            const caller = () => callerOf(extra._meta, server.server.getClientVersion(), context.folder);
            const result = await track(runTool(command, input, context, caller, extra._meta));

            if (command === aiMove && result.isError !== true) {
                noteTheAi(context, caller);
            }

            return result;
        });

        if (command.hosts !== undefined) {
            tool.disable();
            forSomeHosts.push({ hosts: command.hosts, tool });
        }
    }

    // A tool for some hosts is offered once the host has said its name, before it lists the tools.
    server.server.oninitialized = () => {
        const host = server.server.getClientVersion()?.name;

        for (const { tool } of forSomeHosts.filter((each) => host !== undefined && each.hosts.includes(host))) {
            tool.enable();
        }
    };

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
    const pageFirst = lazyPage(async () => {
        context.page = await pageOf(context, () => opponentOf(context.host?.()));
    });
    const server = createMcpServer(context, list, pageFirst);
    await server.connect(new StdioServerTransport());
}

/**
 * The board page started once, before the chat's first call, the status every chat opens with, which then gives its address: the process of a Codex
 * agent, which has one of its own, starts none, which would stand beside the chat's and could keep the doorbell from it (D-98, Priya).
 */
export function lazyPage(start: () => Promise<void>): (meta: Record<string, unknown> | undefined) => Promise<void>
{
    let page: Promise<void> | undefined;

    return async (meta) => {
        if (!fromCodexAgent(meta)) {
            page ??= start();
            await page;
        }
    };
}

/** The opponent's name for the page, from the host's (D-97): another host than Claude's and Codex is unnamed. */
export function opponentOf(host: string | undefined): string | undefined
{
    return aiNameOf(host);
}

/** The board page of the player's folder, served by this process for as long as the chat lasts (D-47); without it the game goes on in the chat. */
async function pageOf(context: Context, opponent: () => string | undefined): Promise<string | undefined>
{
    try {
        const { url, heard, chatCalls, open, askNewGame } = await startPage(context, opponent);
        // Words the AI is given change no file: the pages hear of them from the commands.
        context.heard = heard;
        context.calls = chatCalls;
        context.pageOpen = open;
        context.askNewGame = askNewGame;

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

/**
 * Who played the AI's move, its host and model, read once the move has gone back to the chat, and kept in memory (D-82, D-97): the AI's card on the
 * page shows it, and the game's PGN once it ends; a change shows from the next move. A host that ties no model to the call leaves the last one known.
 */
function noteTheAi(context: Context, caller: () => Promise<Caller | undefined>): void
{
    // Claude Code writes the call's line a few milliseconds late: read after the answer, it costs the AI's clock nothing (D-13).
    setImmediate(() => {
        // Nothing that fails here may stop the server: the move is played and answered.
        caller().then((found) => {
            const host = context.host?.();

            if (host !== undefined && host.trim() !== "") {
                noteAiHost(gameFolder(context.home()), host);
            }

            if (found === undefined || found.hostOnly === true) {
                return;
            }

            if (noteAiModel(gameFolder(context.home()), { model: found.annotator, ...(found.effort === undefined ? {} : { effort: found.effort }) })) {
                context.heard?.();
            }
        }).catch(() => undefined);
    });
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

async function runTool(command: AnyCommand, input: unknown, context: Context, caller: NonNullable<Context["caller"]>, meta: Record<string, unknown> | undefined): Promise<CallToolResult>
{
    const calling = await sharingCaller(command, meta, context);
    const agent = calling !== undefined && "agent" in calling ? calling.agent : undefined;
    const chat = command.byAgents === undefined && agent === undefined;
    let refused = false;

    try {
        if (chat) {
            context.calls?.();
        }

        const run = calling !== undefined && "run" in calling ? calling.run : undefined;
        const who = agent !== undefined ? { agent, ...(run === undefined ? {} : { agentRun: run }) } : calling !== undefined ? { chat: true as const } : {};
        const result: unknown = await command.run(checkedInput(command, input), { ...context, caller, ...who });
        return { content: [{ type: "text", text: command.format(result, context) }] };
    } catch (error) {
        refused = error instanceof PositionChanged;
        return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    } finally {
        // What the tool read or wrote, the chat has seen: the doorbell rings it only for what changes after, and it may move on the game a tool showed it,
        // unless that tool was refused for a position it had not seen. An agent's call is not the chat's.
        if (chat) {
            chatHasRead(context, command.showsGame === true && !refused);
        }
    }
}

/**
 * Who calls a tool the chat shares with an agent, as the analyst (D-89): the chat, or the agent by its type; looked up only in a folder where one may run
 * and while no game goes on, so that no call of the chat's waits for it while it plays. None when it cannot be told, or for an agent the tool is not shared with.
 */
async function sharingCaller(command: AnyCommand, meta: Record<string, unknown> | undefined, context: Context): Promise<CallingAgent | undefined>
{
    const agents = command.sharedWith?.filter((agent) => hasAgent(context.folder, agent, context.host?.())) ?? [];

    if (agents.length === 0 || gameGoingOn(context)) {
        return undefined;
    }

    const caller = await callingAgent(meta, context.folder);
    return caller !== undefined && "agent" in caller && !agents.includes(caller.agent) ? undefined : caller;
}

/** Whether a game goes on, or may: a game that cannot be read is the command's to report, as the chat's call (Federico). */
function gameGoingOn(context: Context): boolean
{
    try {
        const current = loadGame(gameFolder(context.home()));
        return current !== undefined && endOf(current.game) === undefined;
    } catch {
        return true;
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
