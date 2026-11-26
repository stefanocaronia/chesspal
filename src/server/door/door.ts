// The table's door, where the `chesspal mcp` of each chat the table opened knocks: it sits with the key the table made for it, or is told why not.
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerLine, firstLine, type Hello, mostHello, readHello, type Refusal } from "./hello.ts";
import { doorPath, doorVariable, keyVariable } from "./socket.ts";

export interface DoorOptions
{
    /** The table's version: a chat of another is refused. */
    version: string;
    /** Called for each chat that sits, with its socket, paused, and the bytes after its hello, which start its MCP conversation. */
    seated: (key: string, socket: Socket, rest: Buffer) => void;
    /** The operating system, as process.platform names it: a named pipe on Windows, a socket file elsewhere. */
    platform?: string;
    /** Where the folder of the socket file is made, off Windows: the system's temporary folder unless given. */
    folder?: string;
    /** Random bytes, for the keys and the door's name. */
    bytes?: (size: number) => Buffer;
    /** How long a knock may take to say hello, in ms. */
    helloWait?: number;
    /** How long a key's new server waits for its earlier connection to close before it is refused as busy, in ms: a host that starts its server again. */
    busyWait?: number;
}

/** The door open, listening at `path`. */
export interface Door
{
    readonly path: string;
    /** A new key, for one chat, with the two variables of that chat's server, which tell it to knock here with it. */
    offer(): { key: string; environment: Record<string, string>; };
    /** Forgets a key: the chat sitting with it is sent away, and it sits no more. */
    withdraw(key: string): void;
    /** Refuses every knock from now on, sends away who sits or knocks, and takes the socket file and its folder away. */
    close(): Promise<void>;
}

/** Opens a door on a fresh socket: settled once it listens, so that a chat started after it finds it; it throws, saying why, when it cannot listen. */
export async function openDoor(options: DoorOptions): Promise<Door>
{
    const platform = options.platform ?? process.platform;
    const bytes = options.bytes ?? randomBytes;
    const name = bytes(8).toString("hex");
    let folder: string | undefined;
    let path = doorPath(name, platform, options.folder ?? tmpdir());
    const keys = new Set<string>();
    const sitting = new Map<string, Socket>();
    const knocking = new Set<Socket>();
    let ending = false;

    const refusal = (hello: Hello): Refusal | undefined => {
        if (ending) {
            return "ending";
        }

        if (!keys.has(hello.key)) {
            return "key";
        }

        if (hello.version !== options.version) {
            return "version";
        }

        return sitting.has(hello.key) ? "busy" : undefined;
    };

    const welcome = async (socket: Socket): Promise<void> => {
        socket.on("error", () => undefined);

        if (ending) {
            refuse(socket, "ending");
            return;
        }

        knocking.add(socket);
        const first = await firstLine(socket, options.helloWait ?? 5_000, mostHello);

        // Refused by the door's closing while it said nothing yet.
        if (!knocking.delete(socket)) {
            return;
        }

        const hello = typeof first === "string" ? undefined : readHello(first.line);

        if (typeof first === "string" || hello === undefined) {
            socket.destroy();
            return;
        }

        // A host that starts its server again: the earlier connection is often still closing.
        if (refusal(hello) === "busy") {
            await closedWithin(sitting.get(hello.key)!, options.busyWait ?? 500);
        }

        const refused = refusal(hello);

        if (refused !== undefined || socket.destroyed) {
            refuse(socket, refused ?? "ending");
            return;
        }

        sitting.set(hello.key, socket);
        socket.once("close", () => {
            if (sitting.get(hello.key) === socket) {
                sitting.delete(hello.key);
            }
        });
        socket.write(answerLine({ ok: true }));
        options.seated(hello.key, socket, first.rest);
    };

    const server = createServer((socket) => void welcome(socket));

    try {
        // Off Windows the socket file sits in a folder of its own, for the player alone (mkdtemp makes it 0700).
        folder = platform === "win32" ? undefined : mkdtempSync(join(options.folder ?? tmpdir(), "chesspal-door-"));
        path = doorPath(name, platform, folder ?? "");
        await listen(server, path);
    } catch (error) {
        removeFolder(folder);
        throw new Error(`Chesspal's table could not open its door for the chats it opens at ${path} (${(error as Error).message}): start the table again.`);
    }

    return {
        path,
        offer: () => {
            const key = bytes(32).toString("hex");
            keys.add(key);
            return { key, environment: { [doorVariable]: path, [keyVariable]: key } };
        },
        withdraw: (key) => {
            keys.delete(key);
            sitting.get(key)?.destroy();
        },
        close: async () => {
            ending = true;
            const closed = new Promise<void>((done) => server.close(() => done()));
            knocking.forEach((socket) => refuse(socket, "ending"));
            knocking.clear();
            sitting.forEach((socket) => socket.destroy());
            await closed;
            removeFolder(folder);
        },
    };
}

/** Tells a knock why it may not sit, then closes it. */
function refuse(socket: Socket, refused: Refusal): void
{
    socket.end(answerLine({ refused }), () => socket.destroy());
}

/** Settles once the socket has closed, or after `wait` ms. */
function closedWithin(socket: Socket, wait: number): Promise<void>
{
    return new Promise((done) => {
        const timer = setTimeout(finish, wait);
        socket.once("close", finish);

        function finish(): void
        {
            clearTimeout(timer);
            socket.off("close", finish);
            done();
        }
    });
}

function removeFolder(folder: string | undefined): void
{
    if (folder !== undefined) {
        rmSync(folder, { recursive: true, force: true });
    }
}

function listen(server: Server, path: string): Promise<void>
{
    return new Promise((done, failed) => {
        server.once("error", failed);
        server.listen(path, () => {
            server.off("error", failed);
            done();
        });
    });
}
