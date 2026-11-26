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
    /** The chat's own context, its state kept here: what it was given, the game and the position it saw. The table reads it, and marks what it showed. */
    readonly context: Context;
    /**
     * Settled once the place is withdrawn, or the places closed, and its calls still running have answered or the places' `leaveWait` has passed. It
     * does not mean stopped: a command still running then goes on to its end, as a move written or a ponder that waits for the player.
     */
    readonly left: Promise<void>;
    /**
     * Withdraws the place: its server, if connected, is sent away, and its key is good no more. A command of its chat still running is not stopped: it
     * ends by itself, with no one to hear its answer.
     */
    withdraw(): void;
}

/** The table's places for the chats it opens. */
export interface TablePlaces
{
    /**
     * A place for a chat of `role` that runs in `folder`, the folder its host is started in, where the commands read the host's files (its agents, its
     * chats' notes): its context the table's, with that folder, the chat's own state, and what `chat` overrides there (the page's hooks, the caller). The
     * door opens at the first offer; one that could not open is tried again at the next.
     */
    offer(role: ChatRole, folder: string, chat?: Partial<Context>): Promise<Place>;
    /** Withdraws every place and closes the door: settled once every place has left, whether the door had opened or not. */
    close(): Promise<void>;
}

/** What the places run with besides the table's context; the tests inject them. */
export interface PlacesOptions
{
    /** The version a chat's server must run: the table's own unless given. */
    version?: string;
    /** The operating system, as process.platform names it: a named pipe on Windows, a socket file elsewhere. */
    platform?: string;
    /** Where the folder of the door's socket file is made, off Windows. */
    socketFolder?: string;
    /** Random bytes: the keys, the door's name, the runs of the agents. */
    bytes?: (size: number) => Buffer;
    /** How long a withdrawn place, or the places closing, wait for its calls still running before `left` settles, in ms. */
    leaveWait?: number;
    /** How long a server that comes back waits for its earlier connection to close, in ms. */
    busyWait?: number;
}

/** The places of a table serving `context`. */
export function tablePlaces(context: Context, options: PlacesOptions = {}): TablePlaces
{
    const places = new Map<string, OpenPlace>();
    // The open places' `left`: each goes once settled.
    const lefts = new Map<string, Promise<void>>();
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

        void sit(place, socket, rest).catch(() => socket.destroy());
    };

    const doorOpen = (): Promise<Door> => {
        if (door === undefined) {
            const opening = openDoor({ version: options.version ?? version, seated, bytes, ...doorPlace(options) });
            door = opening;
            // A door that could not open is opened anew at the next offer.
            opening.catch(() => {
                if (door === opening) {
                    door = undefined;
                }
            });
        }

        return door;
    };

    return {
        offer: async (role, folder, chat = {}) => {
            const refused = "The table is closing, and opens no more chats: open the chat again once the table is open again.";

            if (closing) {
                throw new Error(refused);
            }

            const open = await doorOpen();

            if (closing) {
                throw new Error(refused);
            }

            const { key, environment } = open.offer();
            let ended = (): void => undefined;
            const left = new Promise<void>((done) => {
                ended = done;
            });
            const place = openPlace(role, { ...context, folder }, chat, `table-${bytes(8).toString("hex")}`);
            places.set(key, place);
            lefts.set(key, left);
            void left.then(() => lefts.delete(key));

            place.withdraw = () => {
                if (places.delete(key)) {
                    open.withdraw(key);
                    void callsOfPlace(place, leaveWait).then(ended);
                }
            };

            return { role, environment, context: place.context, left, withdraw: place.withdraw };
        },
        close: async () => {
            closing = true;
            [...places.values()].forEach((place) => place.withdraw());
            const open = await door?.catch(() => undefined);
            await open?.close();
            await Promise.all(lefts.values());
        },
    };
}

/** A place as the table keeps it: its chat's context, who calls there, its server while one is connected, and every server it had. */
interface OpenPlace
{
    role: ChatRole;
    context: Context;
    seat: { agent?: string; run?: string; caller?: Context["caller"]; };
    server?: McpServer;
    servers: McpServer[];
    withdraw: () => void;
}

/** The agent of each helper's role, by the name its tools are kept under. */
const agentOfRole: Readonly<Record<Exclude<ChatRole, "opponent">, string>> = { ponder: ownModelPonderAgent, coach: coachAgent, analyst: analystAgent };

function openPlace(role: ChatRole, context: Context, chat: Partial<Context>, run: string): OpenPlace
{
    const agent = role === "opponent" ? undefined : agentOfRole[role];
    const seat = agent === undefined ? { caller: chat.caller } : { agent, run, caller: chat.caller };
    const place: OpenPlace = { role, context, seat, servers: [], withdraw: () => undefined };
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

/**
 * A chat seated at its place: an MCP server over the rest of its socket, at once, whatever calls of an earlier server still run. When the socket closes, its
 * server closes at once: a call still running ends with no one to hear its answer.
 */
async function sit(place: OpenPlace, socket: Socket, rest: Buffer): Promise<void>
{
    const { createMcpServer, StdioServerTransport } = await serverModules();

    // Gone while the server loaded.
    if (socket.destroyed) {
        return;
    }

    const server = createMcpServer(place.context, toolsOf(place.role), undefined, place.seat);
    place.server = server;
    place.servers.push(server);
    // A transport the SDK closes, as after a line too long, closes the socket.
    server.server.onclose = () => socket.destroy();
    socket.once("close", () => {
        if (place.server === server) {
            place.server = undefined;
        }

        void server.close().catch(() => undefined);
    });
    const input = new PassThrough();
    input.write(rest);
    socket.pipe(input);
    await server.connect(new StdioServerTransport(input, socket));
}

/** Settles once the calls still running of every server the place had have answered, or after `leaveWait` ms. */
async function callsOfPlace(place: OpenPlace, leaveWait: number): Promise<void>
{
    if (place.servers.length === 0) {
        return;
    }

    const { callsAnswered } = await serverModules();
    await Promise.all(place.servers.map((server) => callsAnswered(server, leaveWait)));
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

/** The door's platform, folder and wait for a server that comes back, as given: the door's own defaults otherwise. */
function doorPlace(options: PlacesOptions): { platform?: string; folder?: string; busyWait?: number; }
{
    return {
        ...(options.platform === undefined ? {} : { platform: options.platform }),
        ...(options.socketFolder === undefined ? {} : { folder: options.socketFolder }),
        ...(options.busyWait === undefined ? {} : { busyWait: options.busyWait }),
    };
}
