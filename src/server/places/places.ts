// The chats the table opens, a place each: their commands run here, in the table's process, the only one that reads and writes the game; the
// `chesspal mcp` their host starts only passes their lines through the door. A place keeps its chat's state across its server's reconnections.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import { type AnyCommand, commands, type Context } from "../../commands/index.ts";
import { agentTools, analystAgent, coachAgent, ownModelPonderAgent } from "../../host-files/index.ts";
import { version } from "../../version.ts";
import { type Door, openDoor } from "../door/index.ts";

/** Who a chat the table opens is: the opponent, or a helper that works beside it, each with its own tools. */
export type ChatRole = "opponent" | "ponder" | "coach" | "analyst";

/** A chat's place at the table, made before its host starts. */
export interface Place
{
    readonly role: ChatRole;
    /** The two variables of the chat's server configuration, which send its `chesspal mcp` to this place. */
    readonly environment: Readonly<Record<string, string>>;
    /** Settled once the place is withdrawn, or the places closed, and its server has left. */
    readonly left: Promise<void>;
    /** Withdraws the place: its server, if connected, is sent away, and its key is good no more. */
    withdraw(): void;
}

/** The table's places for the chats it opens. */
export interface TablePlaces
{
    /**
     * A place for a chat of `role`, its context the table's with the chat's own state, and what `chat` overrides there (the page's hooks, the caller);
     * the door opens at the first offer.
     */
    offer(role: ChatRole, chat?: Partial<Context>): Promise<Place>;
    /** Withdraws every place and closes the door. */
    close(): Promise<void>;
}

/** What the places run with besides the table's context; the tests inject them. */
export interface PlacesOptions
{
    /** The version a chat's server must run: the table's own unless given. */
    version?: string;
    /** The operating system, as process.platform names it: a named pipe on Windows, a socket file elsewhere. */
    platform?: string;
    /** The folder of the door's socket file, off Windows. */
    socketFolder?: string;
    /** Random bytes: the keys, the door's name, the runs of the agents. */
    bytes?: (size: number) => Buffer;
    /** How long a server that lost its connection waits for its calls still running, in ms. */
    leaveWait?: number;
}

/** The places of a table serving `context`. */
export function tablePlaces(context: Context, options: PlacesOptions = {}): TablePlaces
{
    const places = new Map<string, OpenPlace>();
    const lefts: Promise<void>[] = [];
    const bytes = options.bytes ?? randomBytes;
    const leaveWait = options.leaveWait ?? 5_000;
    let door: Promise<Door> | undefined;
    let closing = false;

    const seated = (key: string, socket: Socket, rest: Buffer): void => {
        const place = places.get(key);

        if (place === undefined) {
            socket.destroy();
            return;
        }

        void sit(place, socket, rest, leaveWait).catch(() => socket.destroy());
    };

    const doorOpen = (): Promise<Door> => door ??= openDoor({ version: options.version ?? version, seated, bytes, ...doorPlace(options) });

    return {
        offer: async (role, chat = {}) => {
            const open = await doorOpen();

            if (closing) {
                throw new Error("The table is closing, and opens no more chats: open the chat again once the table is open again.");
            }

            const { key, environment } = open.offer();
            let ended = (): void => undefined;
            const left = new Promise<void>((done) => {
                ended = done;
            });
            const place = openPlace(role, context, chat, `table-${bytes(8).toString("hex")}`);
            places.set(key, place);
            lefts.push(left);

            const withdraw = (): void => {
                if (places.delete(key)) {
                    open.withdraw(key);
                    void leave(place, place.server, leaveWait).then(ended);
                }
            };

            place.withdraw = withdraw;
            return { role, environment, left, withdraw };
        },
        close: async () => {
            closing = true;
            [...places.values()].forEach((place) => place.withdraw());
            await (await door)?.close();
            await Promise.all(lefts);
        },
    };
}

/** A place as the table keeps it: its chat's context, who calls there, and its server while one is connected. */
interface OpenPlace
{
    role: ChatRole;
    context: Context;
    seat: { agent?: string; run?: string; caller?: Context["caller"]; };
    server?: McpServer;
    leaving?: Promise<void>;
    withdraw: () => void;
}

/** The agent of each helper's role, by the name its tools are kept under. */
const agentOfRole: Readonly<Record<Exclude<ChatRole, "opponent">, string>> = { ponder: ownModelPonderAgent, coach: coachAgent, analyst: analystAgent };

function openPlace(role: ChatRole, context: Context, chat: Partial<Context>, run: string): OpenPlace
{
    const agent = role === "opponent" ? undefined : agentOfRole[role];
    const place: OpenPlace = { role, context, seat: agent === undefined ? { caller: chat.caller } : { agent, run, caller: chat.caller }, withdraw: () => undefined };
    // The chat's own state, as a server started anew has it; its host, as its server's client names itself.
    place.context = {
        ...context,
        given: new Set(),
        told: new Set(),
        seen: undefined,
        positionSeen: null,
        positionFirstSeen: undefined,
        host: () => place.server?.server.getClientVersion()?.name,
        ...chat,
    };
    return place;
}

/**
 * The tools of a role: the opponent's every tool but the agents' own; a helper's exactly its agent's, whatever the host, since the role stands in for the
 * host's own agent: the hosts a command is offered to count for the opponent alone.
 */
function toolsOf(role: ChatRole): AnyCommand[]
{
    if (role === "opponent") {
        return commands.filter((command) => command.byAgents === undefined);
    }

    const own = agentTools(agentOfRole[role]) ?? [];
    return commands.filter((command) => own.includes(command.name)).map(forEveryHost);
}

/** A command offered to every host. */
function forEveryHost(command: AnyCommand): AnyCommand
{
    const { hosts, ...offered } = command;
    return offered;
}

/** A chat seated at its place: an MCP server over the rest of its socket, once the server of its earlier connection has left. */
async function sit(place: OpenPlace, socket: Socket, rest: Buffer, leaveWait: number): Promise<void>
{
    await place.leaving;
    const { createMcpServer, StdioServerTransport } = await serverModules();

    // Gone while the server loaded.
    if (socket.destroyed) {
        return;
    }

    const server = createMcpServer(place.context, toolsOf(place.role), undefined, place.seat);
    place.server = server;
    // A transport the SDK closes, as after a line too long, closes the socket.
    server.server.onclose = () => socket.destroy();
    socket.once("close", () => void leave(place, server, leaveWait));
    const input = new PassThrough();
    input.write(rest);
    socket.pipe(input);
    await server.connect(new StdioServerTransport(input, socket));
}

/** A server of the place closed, once its calls still running have answered or `leaveWait` has passed: the place's state stays for its next connection. */
function leave(place: OpenPlace, server: McpServer | undefined, leaveWait: number): Promise<void>
{
    if (server === undefined || place.server !== server) {
        return place.leaving ?? Promise.resolve();
    }

    place.leaving ??= (async () => {
        const { callsAnswered } = await serverModules();
        await callsAnswered(server, leaveWait);
        await server.close().catch(() => undefined);

        if (place.server === server) {
            place.server = undefined;
        }

        place.leaving = undefined;
    })();
    return place.leaving;
}

// The MCP server and its SDK, loaded at the first chat that sits: the table starts without them.
let loading: Promise<ServerModules> | undefined;

interface ServerModules
{
    createMcpServer: typeof import("../mcp/index.ts").createMcpServer;
    callsAnswered: typeof import("../mcp/index.ts").callsAnswered;
    StdioServerTransport: typeof import("@modelcontextprotocol/sdk/server/stdio.js").StdioServerTransport;
}

function serverModules(): Promise<ServerModules>
{
    loading ??= Promise.all([import("../mcp/index.ts"), import("@modelcontextprotocol/sdk/server/stdio.js")]).then(([mcp, stdio]) => ({
        createMcpServer: mcp.createMcpServer,
        callsAnswered: mcp.callsAnswered,
        StdioServerTransport: stdio.StdioServerTransport,
    }));
    return loading;
}

/** The door's platform and folder, as given: the door's own defaults otherwise. */
function doorPlace(options: PlacesOptions): { platform?: string; folder?: string; }
{
    return { ...(options.platform === undefined ? {} : { platform: options.platform }), ...(options.socketFolder === undefined ? {} : { folder: options.socketFolder }) };
}
